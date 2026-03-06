@echo off
chcp 65001 >nul 2>&1

REM Change to script's own directory
cd /d "%~dp0"

echo ================================================
echo   DailyFNI - Cafe Generator
echo ================================================
echo.

REM [1/5] Python check
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed.
    echo   Please install Python 3.9+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYVER=%%i
echo [1/5] Python: %PYVER%

REM [2/5] Create venv (only if not exists)
if not exist ".venv\Scripts\activate.bat" (
    echo [2/5] Creating virtual environment...
    if exist ".venv" rmdir /s /q .venv
    python -m venv .venv
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
) else (
    echo [2/5] Virtual environment found
)

REM Activate venv
call .venv\Scripts\activate.bat

REM [3/5] Install packages
echo [3/5] Installing packages...
pip install -q -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install packages.
    pause
    exit /b 1
)

REM [4/5] Playwright browser install (first time only)
if not exist "%USERPROFILE%\.cache\ms-playwright" (
    echo [4/5] Playwright browser installing... (first time, may take a while)
    playwright install chromium
) else (
    echo [4/5] Playwright browser found
)

REM .env file check
if not exist ".env" (
    echo.
    echo [WARNING] .env file not found!
    echo   Copy .env.example to .env and configure:
    echo   copy .env.example .env
    echo   notepad .env
    echo.
)

REM Create data directories
if not exist "data\cookies" mkdir "data\cookies"
if not exist "data\logs" mkdir "data\logs"

REM [5/5] Start server
echo [5/5] Starting server...
echo.
echo ================================================
echo   Open http://localhost:8001 in your browser
echo   Press Ctrl+C to stop
echo ================================================
echo.

cd backend
python main.py

pause
