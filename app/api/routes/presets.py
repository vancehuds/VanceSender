"""Preset CRUD routes."""

from __future__ import annotations

import json
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


def _preset_path(preset_id: str) -> Path:
    return PRESETS_DIR / f"{preset_id}.json"


def _read_preset(preset_id: str) -> dict[str, Any]:
    path = _preset_path(preset_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"预设 '{preset_id}' 不存在")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_preset(preset_id: str, data: dict[str, Any]) -> None:
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    with open(_preset_path(preset_id), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


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
    """删除预设。"""
    path = _preset_path(preset_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"预设 '{preset_id}' 不存在")
    path.unlink()
    return MessageResponse(message=f"预设 '{preset_id}' 已删除")
