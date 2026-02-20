"""Preset CRUD routes."""

from __future__ import annotations

import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.api.schemas import (
    MessageResponse,
    PresetCreate,
    PresetResponse,
    PresetUpdate,
)
from app.core.config import PRESETS_DIR

router = APIRouter()


_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_preset_id(preset_id: str) -> str:
    """Validate preset_id to prevent path-traversal attacks."""
    safe_id = str(preset_id).strip()
    if not safe_id or not _SAFE_ID_RE.fullmatch(safe_id):
        raise HTTPException(
            status_code=400,
            detail=f"\u9884\u8bbe ID '{preset_id}' \u5305\u542b\u975e\u6cd5\u5b57\u7b26",
        )
    return safe_id


def _preset_path(preset_id: str) -> Path:
    safe_id = _validate_preset_id(preset_id)
    return PRESETS_DIR / f"{safe_id}.json"


def _read_preset(preset_id: str) -> dict[str, Any]:
    path = _preset_path(preset_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"\u9884\u8bbe '{preset_id}' \u4e0d\u5b58\u5728")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        raise HTTPException(
            status_code=500, detail=f"\u9884\u8bbe\u6587\u4ef6\u8bfb\u53d6\u5931\u8d25: {exc}"
        )


def _write_preset(preset_id: str, data: dict[str, Any]) -> None:
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    target = _preset_path(preset_id)
    try:
        fd, tmp_path = tempfile.mkstemp(
            suffix=".tmp", prefix="preset_", dir=str(PRESETS_DIR)
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, str(target))
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"\u9884\u8bbe\u6587\u4ef6\u5199\u5165\u5931\u8d25: {exc}"
        )


@router.get("", response_model=list[PresetResponse])
async def list_presets():
    """列出所有预设。"""
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    presets: list[dict[str, Any]] = []
    for fp in sorted(PRESETS_DIR.glob("*.json")):
        try:
            with open(fp, "r", encoding="utf-8") as f:
                presets.append(json.load(f))
        except (json.JSONDecodeError, KeyError):
            continue
    return presets


@router.post("", response_model=PresetResponse, status_code=201)
async def create_preset(body: PresetCreate):
    """创建新预设。"""
    now = datetime.now(timezone.utc).isoformat()
    preset_id = uuid.uuid4().hex[:8]
    data = {
        "id": preset_id,
        "name": body.name,
        "texts": [t.model_dump() for t in body.texts],
        "created_at": now,
        "updated_at": now,
    }
    _write_preset(preset_id, data)
    return data


@router.get("/{preset_id}", response_model=PresetResponse)
async def get_preset(preset_id: str):
    """获取单个预设。"""
    return _read_preset(preset_id)


@router.put("/{preset_id}", response_model=PresetResponse)
async def update_preset(preset_id: str, body: PresetUpdate):
    """更新预设。"""
    data = _read_preset(preset_id)
    if body.name is not None:
        data["name"] = body.name
    if body.texts is not None:
        data["texts"] = [t.model_dump() for t in body.texts]
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_preset(preset_id, data)
    return data


@router.delete("/{preset_id}", response_model=MessageResponse)
async def delete_preset(preset_id: str):
    """\u5220\u9664\u9884\u8bbe\u3002"""
    path = _preset_path(preset_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"\u9884\u8bbe '{preset_id}' \u4e0d\u5b58\u5728")
    try:
        path.unlink()
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"\u9884\u8bbe\u5220\u9664\u5931\u8d25: {exc}"
        )
    return MessageResponse(message=f"\u9884\u8bbe '{preset_id}' \u5df2\u5220\u9664")
