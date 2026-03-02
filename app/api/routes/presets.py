"""Preset CRUD routes."""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.api.schemas import (
    MessageResponse,
    PresetBatchDeleteResponse,
    PresetCreate,
    PresetImportResponse,
    PresetResponse,
    PresetUpdate,
)
from app.core.presets import (
    PresetError,
    PresetNotFoundError,
    delete_preset_file,
    list_all_presets,
    now_iso,
    read_preset,
    write_preset,
)

router = APIRouter()


def _handle_preset_error(exc: PresetError) -> HTTPException:
    """Convert domain preset errors into HTTP exceptions."""
    return HTTPException(status_code=exc.status_code, detail=str(exc))


# ── Import / Export (MUST be before /{preset_id} to avoid path conflict) ──


@router.get("/export/all")
async def export_all_presets():
    """导出全部预设为 JSON 文件。"""
    presets = list_all_presets()
    return JSONResponse(
        content=presets,
        headers={
            "Content-Disposition": 'attachment; filename="vancesender_presets.json"',
        },
    )


@router.post("/import", response_model=PresetImportResponse)
async def import_presets(request: Request):
    """从 JSON 导入预设（支持单个对象或数组）。"""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析 JSON 数据")

    items: list[dict[str, Any]]
    if isinstance(body, dict):
        items = [body]
    elif isinstance(body, list):
        items = body
    else:
        raise HTTPException(status_code=400, detail="JSON 必须是预设对象或预设数组")

    imported = 0
    skipped = 0
    errors: list[str] = []

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            skipped += 1
            errors.append(f"第 {idx + 1} 项不是有效的对象")
            continue

        name = item.get("name")
        texts = item.get("texts")

        if not name or not isinstance(name, str):
            skipped += 1
            errors.append(f"第 {idx + 1} 项缺少有效的 name 字段")
            continue

        if not isinstance(texts, list):
            skipped += 1
            errors.append(f"第 {idx + 1} 项缺少有效的 texts 字段")
            continue

        # Validate each text line
        valid_texts: list[dict[str, str]] = []
        for t in texts:
            if isinstance(t, dict) and t.get("content"):
                t_type = t.get("type", "me")
                if t_type not in ("me", "do", "b", "e"):
                    t_type = "me"
                valid_texts.append({"type": t_type, "content": str(t["content"])})

        now = now_iso()
        preset_id = uuid.uuid4().hex[:8]
        data = {
            "id": preset_id,
            "name": str(name).strip(),
            "texts": valid_texts,
            "created_at": now,
            "updated_at": now,
        }

        # Preserve optional fields from source
        if "tags" in item and isinstance(item["tags"], list):
            data["tags"] = [str(tag) for tag in item["tags"] if tag]
        if "sort_order" in item and isinstance(item["sort_order"], (int, float)):
            data["sort_order"] = int(item["sort_order"])

        try:
            write_preset(preset_id, data)
            imported += 1
        except PresetError as exc:
            skipped += 1
            errors.append(f"第 {idx + 1} 项写入失败: {exc}")

    return PresetImportResponse(
        imported=imported,
        skipped=skipped,
        errors=errors,
        message=f"成功导入 {imported} 个预设" + (f"，跳过 {skipped} 个" if skipped else ""),
    )


# ── Batch Delete (MUST be before /{preset_id} to avoid path conflict) ──


@router.post("/batch-delete", response_model=PresetBatchDeleteResponse)
async def batch_delete_presets(request: Request):
    """批量删除预设。接收 {ids: ["id1", "id2", ...]}。"""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析请求数据")

    ids = body.get("ids", [])
    if not isinstance(ids, list) or len(ids) == 0:
        raise HTTPException(status_code=400, detail="ids 必须是非空数组")

    deleted = 0
    failed = 0
    for preset_id in ids:
        try:
            delete_preset_file(str(preset_id))
            deleted += 1
        except PresetError:
            failed += 1

    return PresetBatchDeleteResponse(
        message=f"成功删除 {deleted} 个预设" + (f"，{failed} 个失败" if failed else ""),
        deleted=deleted,
        failed=failed,
    )


# ── CRUD ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[PresetResponse])
async def list_presets(tag: str | None = None):
    """列出所有预设。可通过 ?tag= 筛选。"""
    return list_all_presets(tag_filter=tag)


@router.post("", response_model=PresetResponse, status_code=201)
async def create_preset(body: PresetCreate):
    """创建新预设。"""
    now = now_iso()
    preset_id = uuid.uuid4().hex[:8]
    data = {
        "id": preset_id,
        "name": body.name,
        "texts": [t.model_dump() for t in body.texts],
        "tags": body.tags,
        "sort_order": body.sort_order,
        "created_at": now,
        "updated_at": now,
    }
    try:
        write_preset(preset_id, data)
    except PresetError as exc:
        raise _handle_preset_error(exc)
    return data


@router.get("/export/{preset_id}")
async def export_single_preset(preset_id: str):
    """导出单个预设为 JSON 文件。"""
    try:
        data = read_preset(preset_id)
    except PresetError as exc:
        raise _handle_preset_error(exc)
    safe_name = data.get("name", preset_id).replace('"', "")
    return JSONResponse(
        content=data,
        headers={
            "Content-Disposition": f'attachment; filename="preset_{safe_name}.json"',
        },
    )


@router.get("/{preset_id}", response_model=PresetResponse)
async def get_preset(preset_id: str):
    """获取单个预设。"""
    try:
        return read_preset(preset_id)
    except PresetError as exc:
        raise _handle_preset_error(exc)


@router.put("/{preset_id}", response_model=PresetResponse)
async def update_preset(preset_id: str, body: PresetUpdate):
    """更新预设。"""
    try:
        data = read_preset(preset_id)
    except PresetError as exc:
        raise _handle_preset_error(exc)

    if body.name is not None:
        data["name"] = body.name
    if body.texts is not None:
        data["texts"] = [t.model_dump() for t in body.texts]
    if body.tags is not None:
        data["tags"] = body.tags
    if body.sort_order is not None:
        data["sort_order"] = body.sort_order
    data["updated_at"] = now_iso()

    try:
        write_preset(preset_id, data)
    except PresetError as exc:
        raise _handle_preset_error(exc)
    return data


@router.post("/reorder", response_model=MessageResponse)
async def reorder_presets(request: Request):
    """批量更新预设排序顺序。接收 {ids: ["id1", "id2", ...]}。"""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析请求数据")

    ids = body.get("ids", [])
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids 必须是数组")

    for idx, preset_id in enumerate(ids):
        try:
            data = read_preset(str(preset_id))
            data["sort_order"] = idx
            data["updated_at"] = now_iso()
            write_preset(str(preset_id), data)
        except PresetError:
            continue

    return MessageResponse(message=f"已更新 {len(ids)} 个预设的排序")


@router.delete("/{preset_id}", response_model=MessageResponse)
async def delete_preset(preset_id: str):
    """删除预设。"""
    try:
        delete_preset_file(preset_id)
    except PresetError as exc:
        raise _handle_preset_error(exc)
    return MessageResponse(message=f"预设 '{preset_id}' 已删除")

