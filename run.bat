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

:: Start Blog Generator in a new window
start "DailyFNI Blog Generator" cmd /c "%~dp0blog-generator\run.bat"

:: Start Cafe Macro in a new window
start "DailyFNI Cafe Macro" cmd /c "%~dp0naver-cafe-macro\run.bat"

echo   Blog Generator  : http://localhost:8000
echo   Cafe Macro       : http://localhost:8001
echo.
echo   Each server runs in its own window.
echo   Close this window or press any key to exit launcher.
echo.
pause
