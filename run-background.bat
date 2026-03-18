@echo off
chcp 65001 >nul 2>&1

REM Change to script's own directory
cd /d "%~dp0"
set "ROOT_DIR=%~dp0"

echo ================================================
echo   DailyFNI - Background Server Launcher
echo   Blog Generator (port 8000)
echo   Cafe Macro     (port 8001)
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

REM ---- Blog Generator: venv & packages ----
echo [2/4] Preparing Blog Generator environment...
if not exist "%ROOT_DIR%blog-generator\.venv\Scripts\python.exe" (
    echo   Creating virtual environment (blog)...
    if exist "%ROOT_DIR%blog-generator\.venv" rmdir /s /q "%ROOT_DIR%blog-generator\.venv"
    python -m venv "%ROOT_DIR%blog-generator\.venv"
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create blog virtual environment.
        pause
        exit /b 1
    )
)
echo   Installing blog packages...
"%ROOT_DIR%blog-generator\.venv\Scripts\pip.exe" install -q -r "%ROOT_DIR%blog-generator\requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install blog packages.
    pause
    exit /b 1
)

REM ---- Cafe Macro: venv & packages ----
echo [3/4] Preparing Cafe Macro environment...
if not exist "%ROOT_DIR%naver-cafe-macro\.venv\Scripts\python.exe" (
    echo   Creating virtual environment (cafe)...
    if exist "%ROOT_DIR%naver-cafe-macro\.venv" rmdir /s /q "%ROOT_DIR%naver-cafe-macro\.venv"
    python -m venv "%ROOT_DIR%naver-cafe-macro\.venv"
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create cafe virtual environment.
        pause
        exit /b 1
    )
)
echo   Installing cafe packages...
"%ROOT_DIR%naver-cafe-macro\.venv\Scripts\pip.exe" install -q -r "%ROOT_DIR%naver-cafe-macro\requirements.txt"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install cafe packages.
    pause
    exit /b 1
)

REM Playwright browser install (first time only)
if not exist "%USERPROFILE%\.cache\ms-playwright" (
    echo   Playwright browser installing... (first time, may take a while)
    "%ROOT_DIR%blog-generator\.venv\Scripts\playwright.exe" install chromium
)

REM .env file checks
if not exist "%ROOT_DIR%blog-generator\.env" (
    echo [WARNING] blog-generator\.env file not found! Copy .env.example to .env
)

REM Create data/log directories
if not exist "%ROOT_DIR%blog-generator\data\cookies" mkdir "%ROOT_DIR%blog-generator\data\cookies"
if not exist "%ROOT_DIR%blog-generator\data\logs" mkdir "%ROOT_DIR%blog-generator\data\logs"
if not exist "%ROOT_DIR%logs" mkdir "%ROOT_DIR%logs"

REM ---- Check if servers are already running ----
set "BLOG_RUNNING=0"
set "CAFE_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8000 "') do set "BLOG_RUNNING=1"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8001 "') do set "CAFE_RUNNING=1"

if "%BLOG_RUNNING%"=="1" if "%CAFE_RUNNING%"=="1" (
    echo.
    echo [!] Both servers are already running!
    echo     Blog: http://localhost:8000
    echo     Cafe: http://localhost:8001
    echo     Use stop.bat to stop them first.
    pause
    exit /b 0
)

echo.
echo [4/4] Starting servers in background...

REM Launch via VBS (hidden windows, survives terminal close)
wscript "%ROOT_DIR%run-background.vbs"

REM Wait a moment for servers to start
timeout /t 3 /noq >nul

REM Verify servers started
set "BLOG_OK=0"
set "CAFE_OK=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8000 "') do set "BLOG_OK=1"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8001 "') do set "CAFE_OK=1"

echo.
echo ================================================
if "%BLOG_OK%"=="1" (
    echo   [OK] Blog Generator:  http://localhost:8000
) else (
    echo   [..] Blog Generator:  starting... (check logs\blog.log)
)
if "%CAFE_OK%"=="1" (
    echo   [OK] Cafe Macro:      http://localhost:8001
) else (
    echo   [..] Cafe Macro:      starting... (check logs\cafe.log)
)
echo.
echo   Logs: logs\blog.log, logs\cafe.log
echo   Stop: run stop.bat
echo   Status: run status.bat
echo.
echo   Terminal can be safely closed!
echo ================================================
echo.
pause
