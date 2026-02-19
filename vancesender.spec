# -*- mode: python ; coding: utf-8 -*-

from __future__ import annotations

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


project_root = Path(SPECPATH).resolve()
icon_png_path = project_root / "ICON.PNG"
icon_ico_path = project_root / "ICON.ico"


def _resolve_pyinstaller_icon_path() -> str | None:
    """Return preferred EXE icon path and generate ICO from ICON.PNG when needed."""
    if not icon_png_path.exists() and not icon_ico_path.exists():
        return None

    if icon_png_path.exists():
        should_generate_ico = not icon_ico_path.exists()
        if not should_generate_ico:
            try:
                should_generate_ico = (
                    icon_ico_path.stat().st_mtime < icon_png_path.stat().st_mtime
                )
            except OSError:
                should_generate_ico = False

        if should_generate_ico:
            try:
                from PIL import Image

                with Image.open(icon_png_path) as source_icon:
                    source_icon.save(
                        icon_ico_path,
                        format="ICO",
                        sizes=[
                            (16, 16),
                            (24, 24),
                            (32, 32),
                            (48, 48),
                            (64, 64),
                            (128, 128),
                            (256, 256),
                        ],
                    )
            except Exception:
                pass

    if icon_ico_path.exists():
        return str(icon_ico_path)
    if icon_png_path.exists():
        return str(icon_png_path)
    return None


exe_icon_path = _resolve_pyinstaller_icon_path()

datas = [
    (str(project_root / "app" / "web"), "app/web"),
    (str(project_root / "config.yaml.example"), "."),
]

if icon_png_path.exists():
    datas.append((str(icon_png_path), "."))

if icon_ico_path.exists():
    datas.append((str(icon_ico_path), "."))

hiddenimports = collect_submodules("uvicorn") + [
    *collect_submodules("webview"),
    *collect_submodules("pystray"),
    *collect_submodules("PIL"),
    "multipart",
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
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="VanceSender",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    icon=exe_icon_path,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="VanceSender",
)
