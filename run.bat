@echo off
chcp 65001 >nul 2>&1

REM Change to script's own directory
cd /d "%~dp0"

echo ================================================
echo   DailyFNI - All Servers Launcher
echo   Blog Generator (port 8000)
echo   Cafe Generator (port 8001)
echo ================================================
echo.

REM ---- Python check ----
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed.
    echo   Please install Python 3.9+ from https://www.python.org/downloads/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PYVER=%%i
echo [1/4] Python: %PYVER%

REM ---- Blog Generator: Python venv & dependencies ----
echo [2/4] Preparing Blog Generator environment...
if not exist "blog-generator\.venv\Scripts\activate.bat" (
    echo   Creating virtual environment (blog)...
    if exist "blog-generator\.venv" rmdir /s /q "blog-generator\.venv"
    python -m venv "blog-generator\.venv"
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create blog virtual environment.
        pause
        exit /b 1
    )
)

call "blog-generator\.venv\Scripts\activate.bat"
pip install -q -r "blog-generator\requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install blog packages.
    pause
    exit /b 1
)

REM ---- Cafe Generator: Python venv & dependencies ----
echo [3/4] Preparing Cafe Generator environment...
if not exist "cafe-generator\.venv\Scripts\activate.bat" (
    echo   Creating virtual environment (cafe)...
    if exist "cafe-generator\.venv" rmdir /s /q "cafe-generator\.venv"
    python -m venv "cafe-generator\.venv"
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create cafe virtual environment.
        pause
        exit /b 1
    )
)

call "cafe-generator\.venv\Scripts\activate.bat"
pip install -q -r "cafe-generator\requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install cafe packages.
    pause
    exit /b 1
)

REM Playwright browser install (first time only)
if not exist "%USERPROFILE%\.cache\ms-playwright" (
    echo   Playwright browser installing... (first time, may take a while)
    playwright install chromium
)

REM .env file checks
if not exist "blog-generator\.env" (
    echo [WARNING] blog-generator\.env file not found! Copy .env.example to .env
)
if not exist "cafe-generator\.env" (
    echo [WARNING] cafe-generator\.env file not found! Copy .env.example to .env
)

REM Create data directories
if not exist "blog-generator\data\cookies" mkdir "blog-generator\data\cookies"
if not exist "blog-generator\data\logs" mkdir "blog-generator\data\logs"
if not exist "cafe-generator\data\cookies" mkdir "cafe-generator\data\cookies"
if not exist "cafe-generator\data\logs" mkdir "cafe-generator\data\logs"

echo.
echo [4/4] Starting all servers simultaneously...
echo.
echo ================================================
echo   Blog Generator:    http://localhost:8000
echo   Cafe Generator:    http://localhost:8001
echo   Press Ctrl+C in each window to stop
echo ================================================
echo.

REM Save root path for start commands
set "ROOT_DIR=%~dp0"

REM Start Blog Generator server in a new window
start "DailyFNI - Blog (port 8000)" /D "%ROOT_DIR%blog-generator\backend" cmd /k "%ROOT_DIR%blog-generator\.venv\Scripts\python.exe" main.py

REM Start Cafe Generator server in a new window
start "DailyFNI - Cafe (port 8001)" /D "%ROOT_DIR%cafe-generator\backend" cmd /k "%ROOT_DIR%cafe-generator\.venv\Scripts\python.exe" main.py

echo.
echo Both servers launched in separate windows.
echo Close this window or press any key to exit launcher.
pause
