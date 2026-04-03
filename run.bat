@echo off
chcp 65001 >nul
title DailyFNI

:MENU
cls
echo ================================================
echo   DailyFNI - 네이버 블로그 자동화 솔루션
echo ================================================
echo.
echo   1. 실행
echo   2. 정지
echo   3. 재실행
echo.
set /p CHOICE=선택:

if "%CHOICE%"=="1" goto START
if "%CHOICE%"=="2" goto STOP
if "%CHOICE%"=="3" goto RESTART
echo 잘못된 입력입니다.
pause
goto MENU

:START
cls
echo 서버 시작 중...
start "DailyFNI-Backend" /min cmd /k "cd /d "%~dp0" && node src/index.js"
timeout /t 2 /nobreak >nul
start "DailyFNI-Python" /min cmd /k "cd /d "%~dp0blog-generator\backend" && uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 2 /nobreak >nul
start "DailyFNI-Frontend" /min cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul
echo.
echo   대시보드:  http://localhost:5173
echo   백엔드:    http://localhost:3000
echo   Python:    http://localhost:8000
echo.
pause
goto MENU

:STOP
cls
echo 서버 중지 중...
taskkill /fi "WINDOWTITLE eq DailyFNI-Backend*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Python*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Frontend*" /f >nul 2>&1
echo 완료.
pause
goto MENU

:RESTART
cls
echo 재시작 중...
taskkill /fi "WINDOWTITLE eq DailyFNI-Backend*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Python*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Frontend*" /f >nul 2>&1
timeout /t 2 /nobreak >nul
goto START
