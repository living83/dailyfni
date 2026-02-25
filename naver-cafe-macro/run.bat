@echo off
title DailyFNI Cafe Macro

echo ========================================
echo   DailyFNI Cafe Macro Server
echo ========================================
echo.

:: Find Python 3.12 or 3.13 (avoid 3.14 which lacks wheel support)
set PYTHON=
where py >nul 2>nul
if not errorlevel 1 (
    py -3.12 --version >nul 2>nul
    if not errorlevel 1 (
        set PYTHON=py -3.12
        goto :found
    )
    py -3.13 --version >nul 2>nul
    if not errorlevel 1 (
        set PYTHON=py -3.13
        goto :found
    )
)
python --version >nul 2>nul
if not errorlevel 1 (
    set PYTHON=python
    goto :found
)

echo [ERROR] Python not found. Install Python 3.12 from:
echo   https://www.python.org/downloads/
pause
exit /b 1

:found
echo Using: %PYTHON%
%PYTHON% --version
echo.

echo [1/2] Installing packages...
%PYTHON% -m pip install -r "%~dp0requirements.txt" -q

echo [2/2] Starting server...
echo.
echo   Open http://localhost:8001
echo   Press Ctrl+C to stop
echo.
echo ========================================

cd /d "%~dp0backend"
%PYTHON% main.py

pause
