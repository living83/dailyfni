@echo off
title DailyFNI Cafe Macro

echo ========================================
echo   DailyFNI Cafe Macro Server
echo ========================================
echo.

echo [1/2] Installing packages...
python -m pip install -r "%~dp0requirements.txt" -q
if errorlevel 1 (
    echo [ERROR] pip failed. Trying 'py' launcher...
    py -m pip install -r "%~dp0requirements.txt" -q
)

echo [2/2] Starting server...
echo.
echo   Open http://localhost:8001
echo   Press Ctrl+C to stop
echo.
echo ========================================

cd /d "%~dp0backend"
python main.py
if errorlevel 1 (
    py main.py
)

pause
