@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

title VanceSender
cd /d "%~dp0"

echo.
echo ===========================================
echo VanceSender one-click startup
echo ===========================================
echo.

echo [1/4] Checking Python...
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
echo [2/4] Preparing virtual environment...

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

echo [3/4] Checking dependencies...
set "DEPS_HASH_FILE=.venv\.deps_hash"
set "NEED_INSTALL=0"
set "NEW_HASH="

if not exist "requirements.txt" (
    echo [ERROR] requirements.txt not found.
    pause
    exit /b 1
)

for /f "skip=1 delims=" %%h in ('certutil -hashfile requirements.txt MD5 ^| findstr /R "^[0-9A-F][0-9A-F]"') do (
    set "NEW_HASH=%%h"
    goto :hash_ready
)

:hash_ready
if not defined NEW_HASH (
    set "NEED_INSTALL=1"
) else if not exist "!DEPS_HASH_FILE!" (
    set "NEED_INSTALL=1"
) else (
    set /p OLD_HASH=<"!DEPS_HASH_FILE!"
    if /I not "!NEW_HASH!"=="!OLD_HASH!" set "NEED_INSTALL=1"
)

if "!NEED_INSTALL!"=="1" (
    echo     Installing dependencies...
    pip install -r requirements.txt --disable-pip-version-check
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        echo Try mirror: pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
        pause
        exit /b 1
    )
    if defined NEW_HASH (
        > "!DEPS_HASH_FILE!" echo !NEW_HASH!
    )
    echo     Dependencies installed.
) else (
    echo     Dependencies are up to date.
)

echo [4/4] Starting VanceSender...
if not exist "data\presets" mkdir "data\presets"

echo.
echo Open in browser: http://127.0.0.1:8730
echo Press Ctrl+C to stop.
echo.

!PYTHON_CMD! main.py %*
set "EXIT_CODE=%ERRORLEVEL%"

rem Ctrl+C / Ctrl+Break on Windows may surface as 0xC000013A (3221225786) or 130.
if "%EXIT_CODE%"=="3221225786" set "EXIT_CODE=0"
if "%EXIT_CODE%"=="130" set "EXIT_CODE=0"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [!] VanceSender exited with code %EXIT_CODE%.
    echo.
    pause
    exit /b %EXIT_CODE%
)

echo.
exit /b %EXIT_CODE%
