@echo off
title DailyFNI Launcher

echo ========================================
echo   DailyFNI - All Services Launcher
echo ========================================
echo.
echo   [1] Blog Generator  : http://localhost:8000
echo   [2] Cafe Macro       : http://localhost:8001
echo.
echo ========================================
echo.

:: Find working Python
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

:: ---- Blog Generator Setup ----
echo [1/4] Blog Generator - venv setup...
if not exist "%~dp0blog-generator\.venv" (
    %PYTHON% -m venv "%~dp0blog-generator\.venv"
)

echo [2/4] Blog Generator - installing packages...
"%~dp0blog-generator\.venv\Scripts\pip" install -r "%~dp0blog-generator\requirements.txt" -q

:: ---- Cafe Macro Setup ----
echo [3/4] Cafe Macro - venv setup...
if not exist "%~dp0naver-cafe-macro\.venv" (
    %PYTHON% -m venv "%~dp0naver-cafe-macro\.venv"
)

echo [4/4] Cafe Macro - installing packages...
"%~dp0naver-cafe-macro\.venv\Scripts\pip" install -r "%~dp0naver-cafe-macro\requirements.txt" -q

echo.
echo ========================================
echo   Starting both servers...
echo ========================================
echo.

:: Start Blog Generator in a new window
start "DailyFNI Blog Generator (port 8000)" cmd /k "cd /d "%~dp0blog-generator\backend" && "%~dp0blog-generator\.venv\Scripts\python" main.py"

:: Start Cafe Macro in a new window
start "DailyFNI Cafe Macro (port 8001)" cmd /k "cd /d "%~dp0naver-cafe-macro\backend" && "%~dp0naver-cafe-macro\.venv\Scripts\python" main.py"

echo   Blog Generator  : http://localhost:8000
echo   Cafe Macro       : http://localhost:8001
echo.
echo   Each server runs in its own window.
echo   Close this window or press any key to exit launcher.
echo.
pause
