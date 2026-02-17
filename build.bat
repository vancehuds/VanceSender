@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

title VanceSender Build
cd /d "%~dp0"

echo.
echo ===========================================
echo VanceSender Windows packaging
echo ===========================================
echo.

echo [1/5] Checking Python...
set "PYTHON_CMD="

py -3 --version >nul 2>&1 && set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD (
    python --version >nul 2>&1 && set "PYTHON_CMD=python"
)
if not defined PYTHON_CMD (
    python3 --version >nul 2>&1 && set "PYTHON_CMD=python3"
)

if not defined PYTHON_CMD (
    echo [ERROR] Python 3.10+ not found.
    echo Install Python from: https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%v in ('!PYTHON_CMD! --version 2^>^&1') do set "PY_VER=%%v"
for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
    set "PY_MAJOR=%%a"
    set "PY_MINOR=%%b"
)

if !PY_MAJOR! lss 3 goto :python_too_old
if !PY_MAJOR! equ 3 if !PY_MINOR! lss 10 goto :python_too_old
echo     Python !PY_VER! detected ( !PYTHON_CMD! )
goto :python_ok

:python_too_old
echo [ERROR] Python version too old: !PY_VER!
echo VanceSender requires Python 3.10 or newer.
pause
exit /b 1

:python_ok
echo [2/5] Preparing virtual environment...
if not exist ".venv\Scripts\activate.bat" (
    echo     Creating .venv...
    !PYTHON_CMD! -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

call ".venv\Scripts\activate.bat"

echo [3/5] Installing project dependencies...
pip install -r requirements.txt --disable-pip-version-check
if errorlevel 1 (
    echo [ERROR] Failed to install requirements.
    pause
    exit /b 1
)

echo [4/5] Installing PyInstaller...
pip install pyinstaller --disable-pip-version-check
if errorlevel 1 (
    echo [ERROR] Failed to install PyInstaller.
    pause
    exit /b 1
)

echo [5/5] Building executable (onedir)...
if not exist "vancesender.spec" (
    echo [ERROR] vancesender.spec not found.
    pause
    exit /b 1
)

if exist "build" rmdir /s /q "build"
if exist "dist\VanceSender" rmdir /s /q "dist\VanceSender"

pyinstaller --clean --noconfirm "vancesender.spec"
if errorlevel 1 (
    echo [ERROR] Packaging failed.
    pause
    exit /b 1
)

echo.
echo [OK] Packaging complete.
echo Output folder: dist\VanceSender
echo Main executable: dist\VanceSender\VanceSender.exe
echo.
exit /b 0
