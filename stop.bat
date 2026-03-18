@echo off
chcp 65001 >nul 2>&1

echo ================================================
echo   DailyFNI - Server Stop
echo ================================================
echo.

set "FOUND=0"

REM Kill Blog Generator (port 8000)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8000 "') do (
    echo Stopping Blog Generator (PID: %%a)...
    taskkill /PID %%a /F >nul 2>&1
    set "FOUND=1"
)

REM Kill Cafe Macro (port 8001)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8001 "') do (
    echo Stopping Cafe Macro (PID: %%a)...
    taskkill /PID %%a /F >nul 2>&1
    set "FOUND=1"
)

REM Also kill any remaining pythonw.exe processes for our servers
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq pythonw.exe" /fo list 2^>nul ^| findstr "PID:"') do (
    REM Check if this pythonw is running main.py by checking command line
    wmic process where "ProcessId=%%a" get CommandLine 2>nul | findstr "main.py" >nul 2>&1
    if not errorlevel 1 (
        echo Stopping background Python process (PID: %%a)...
        taskkill /PID %%a /F >nul 2>&1
        set "FOUND=1"
    )
)

echo.
if "%FOUND%"=="1" (
    echo [OK] All DailyFNI servers stopped.
) else (
    echo [INFO] No running servers found.
)
echo.
pause
