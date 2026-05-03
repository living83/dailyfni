@echo off
chcp 65001 >nul
title DailyFNI - 네이버 블로그 자동화 솔루션
cd /d "%~dp0"

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
choice /c 123 /n /m "선택 (1/2/3): "
if errorlevel 3 goto RESTART
if errorlevel 2 goto STOP
if errorlevel 1 goto START

:START
cls
echo [시작] 서버를 실행합니다...
echo.

wscript "%~dp0start_hidden.vbs"
timeout /t 5 /nobreak >nul

echo   [OK] Node.js 백엔드  (포트 3000)
echo   [OK] Python FastAPI   (포트 8000)
echo   [OK] 프론트엔드       (포트 5173)
echo.
echo ================================================
echo   서버가 실행되었습니다!
echo   대시보드:  http://localhost:5173
echo ================================================
echo.
echo 아무 키나 누르면 메뉴로 돌아갑니다...
pause >nul
goto MENU

:STOP
cls
echo [정지] 서버를 중지합니다...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
echo 완료.
echo.
echo 아무 키나 누르면 메뉴로 돌아갑니다...
pause >nul
goto MENU

:RESTART
cls
echo [재시작] 서버를 중지 후 재실행합니다...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
timeout /t 2 /nobreak >nul
goto START
