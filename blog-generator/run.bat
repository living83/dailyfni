@echo off
chcp 65001 >nul 2>&1

REM Change to script's own directory
cd /d "%~dp0"

echo ================================================
echo   DailyFNI - Blog Generator
echo ================================================
echo.

REM Python check
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed.
    echo   Please install Python 3.9+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYVER=%%i
echo [1/3] Python: %PYVER%

REM Remove old broken venv if exists
if exist ".venv" (
    echo [2/3] Removing old virtual environment...
    rmdir /s /q .venv
)

REM Create fresh venv
echo [2/3] Creating virtual environment...
python -m venv .venv
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)

REM Activate venv
call .venv\Scripts\activate.bat

REM Upgrade pip first
python -m pip install --upgrade pip >nul 2>&1

REM Install packages
echo [2/3] Installing packages...
pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install packages.
    pause
    exit /b 1
)

REM Start server
echo [3/3] Starting server...
echo.
echo ================================================
echo   Open http://localhost:8000 in your browser
echo   Press Ctrl+C to stop
echo ================================================
echo.

cd backend
python main.py

pause
