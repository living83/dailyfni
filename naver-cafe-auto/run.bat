@echo off
SET "basedir=%~dp0"

:MENU
cls
echo ================================================
echo   Naver Cafe Automation - Control Panel
echo ================================================
echo.
echo   1. Start  (server runs hidden)
echo   2. Stop
echo   3. Restart
echo.
set /p CHOICE=Enter number (1/2/3): 

if "%CHOICE%"=="1" goto DO_START
if "%CHOICE%"=="2" goto DO_STOP
if "%CHOICE%"=="3" goto DO_RESTART
echo Invalid input.
pause
goto MENU

:DO_START
cls
echo Checking environment...

if not exist "%basedir%.venv\Scripts\python.exe" (
    echo ERROR: .venv not found. Installing packages...
    python -m venv "%basedir%.venv"
    "%basedir%.venv\Scripts\pip" install -r "%basedir%requirements.txt" -q
    "%basedir%.venv\Scripts\playwright" install chromium
)

echo Starting backend...
wscript "%basedir%start_backend.vbs"
timeout /t 3 /nobreak > nul

echo.
echo ================================================
echo   Server started (background / no window)
echo   Backend  : http://localhost:8001
echo ================================================
echo.
pause
goto MENU

:DO_STOP
cls
echo Stopping server...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8001" ^| find "LISTENING"') do taskkill /f /pid %%a > nul 2>&1
echo Done.
pause
goto MENU

:DO_RESTART
cls
echo Restarting...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8001" ^| find "LISTENING"') do taskkill /f /pid %%a > nul 2>&1
timeout /t 2 /nobreak > nul
goto DO_START
