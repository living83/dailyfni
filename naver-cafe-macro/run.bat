@echo off
title DailyFNI Cafe Macro

echo ========================================
echo   DailyFNI Cafe Macro Server
echo ========================================
echo.

set PYTHON=

python -c "print()" >nul 2>nul
if %errorlevel%==0 set PYTHON=python
if defined PYTHON goto :found

py -c "print()" >nul 2>nul
if %errorlevel%==0 set PYTHON=py
if defined PYTHON goto :found

echo [ERROR] Python not found. Install Python 3.12 from:
echo   https://www.python.org/downloads/
pause
exit /b 1

:found
echo Using: %PYTHON%
%PYTHON% --version
echo.

if not exist "%~dp0.venv" (
    echo [0/2] Creating virtual environment...
    %PYTHON% -m venv "%~dp0.venv"
)

echo [1/2] Installing packages...
"%~dp0.venv\Scripts\pip" install -r "%~dp0requirements.txt" -q

echo [2/2] Starting server...
echo.
echo   Open http://localhost:8001
echo   Press Ctrl+C to stop
echo.
echo ========================================

cd /d "%~dp0backend"
"%~dp0.venv\Scripts\python" main.py

pause
