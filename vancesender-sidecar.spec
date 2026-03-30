# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for VanceSender sidecar (headless server mode).

Produces a single-folder distribution with the executable named
``vancesender-server.exe``.  No GUI dependencies (pywebview, pystray,
Pillow) are bundled — the Tauri shell handles window/tray management.
"""

from __future__ import annotations

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

project_root = Path(SPECPATH).resolve()

datas = [
    (str(project_root / "app" / "web"), "app/web"),
    (str(project_root / "config.yaml.example"), "."),
    (str(project_root / "icon.ico"), "."),
]

hiddenimports = collect_submodules("uvicorn") + [
    "multipart",
    "app.core.port_guard",
]

a = Analysis(
    ["main.py"],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["webview", "pystray", "PIL", "tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="vancesender-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon="icon.ico",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="vancesender-server",
)
