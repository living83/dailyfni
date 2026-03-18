@echo off
chcp 65001 >nul 2>&1

echo ================================================
echo   DailyFNI - Server Status
echo ================================================
echo.

set "BLOG_PID="
set "CAFE_PID="

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8000 "') do set "BLOG_PID=%%a"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr "LISTENING" ^| findstr ":8001 "') do set "CAFE_PID=%%a"

if defined BLOG_PID (
    echo   [RUNNING] Blog Generator  http://localhost:8000  (PID: %BLOG_PID%)
) else (
    echo   [STOPPED] Blog Generator  (port 8000)
)

if defined CAFE_PID (
    echo   [RUNNING] Cafe Macro      http://localhost:8001  (PID: %CAFE_PID%)
) else (
    echo   [STOPPED] Cafe Macro      (port 8001)
)

echo.
echo ================================================
echo   Start:  run-background.bat (background)
echo           run.bat             (with console)
echo   Stop:   stop.bat
echo   Logs:   logs\blog.log, logs\cafe.log
echo ================================================
echo.
pause
