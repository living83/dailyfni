@echo off
chcp 65001 >nul 2>&1

REM Change to script's own directory
cd /d "%~dp0"

echo ================================================
echo   DailyFNI - All Servers Launcher
echo   Node.js (port 3000) + Python (port 8000)
echo ================================================
echo.

REM ---- Node.js check ----
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed.
    echo   Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODEVER=%%i
echo [1/4] Node.js: %NODEVER%

REM ---- Python check ----
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed.
    echo   Please install Python 3.9+ from https://www.python.org/downloads/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PYVER=%%i
echo [2/4] Python: %PYVER%

REM ---- Node.js dependencies ----
if not exist "node_modules" (
    echo [3/4] Installing Node.js packages...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install Node.js packages.
        pause
        exit /b 1
    )
) else (
    echo [3/4] Node.js packages found
)

REM ---- Python venv & dependencies ----
echo [4/4] Preparing Python environment...
if not exist "blog-generator\.venv\Scripts\activate.bat" (
    echo   Creating virtual environment...
    if exist "blog-generator\.venv" rmdir /s /q "blog-generator\.venv"
    python -m venv "blog-generator\.venv"
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

call "blog-generator\.venv\Scripts\activate.bat"

pip install -q -r "blog-generator\requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install Python packages.
    pause
    exit /b 1
)

REM Playwright browser install (first time only)
if not exist "%USERPROFILE%\.cache\ms-playwright" (
    echo   Playwright browser installing... (first time, may take a while)
    playwright install chromium
)

REM .env file checks
if not exist ".env" (
    echo.
    echo [WARNING] Root .env file not found! Copy .env.example to .env
)
if not exist "blog-generator\.env" (
    echo [WARNING] blog-generator\.env file not found! Copy .env.example to .env
)

REM Create data directories
if not exist "blog-generator\data\cookies" mkdir "blog-generator\data\cookies"
if not exist "blog-generator\data\logs" mkdir "blog-generator\data\logs"

echo.
echo ================================================
echo   Starting both servers simultaneously...
echo   Node.js Agency:    http://localhost:3000
echo   Blog Generator:    http://localhost:8000
echo   Press Ctrl+C in each window to stop
echo ================================================
echo.

REM Start Node.js server in a new window
start "DailyFNI - Node.js (port 3000)" cmd /k "cd /d "%~dp0" && npm start"

REM Start Python server in a new window
start "DailyFNI - Python (port 8000)" cmd /k "cd /d "%~dp0\blog-generator\backend" && "%~dp0\blog-generator\.venv\Scripts\python.exe" main.py"

echo Both servers launched in separate windows.
echo Close this window or press any key to exit launcher.
pause
