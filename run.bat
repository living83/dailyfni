@echo off
chcp 65001 >nul
title DailyFNI - 네이버 블로그 자동화 솔루션

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
echo [시작] 서버를 실행합니다...
echo.

echo [1/3] Node.js 백엔드 (포트 3000)...
start /b cmd /c "cd /d "%~dp0" && node src/index.js > nul 2>&1"
timeout /t 2 /nobreak >nul
echo       OK

echo [2/3] Python FastAPI (포트 8000)...
start /b cmd /c "cd /d "%~dp0blog-generator\backend" && uvicorn main:app --host 0.0.0.0 --port 8000 > nul 2>&1"
timeout /t 2 /nobreak >nul
echo       OK

echo [3/3] 프론트엔드 (포트 5173)...
start /b cmd /c "cd /d "%~dp0frontend" && npx vite --host 0.0.0.0 --port 5173 > nul 2>&1"
timeout /t 3 /nobreak >nul
echo       OK

echo.
echo ================================================
echo   서버가 실행되었습니다!
echo   대시보드:  http://localhost:5173
echo ================================================
echo.
pause
goto MENU

:STOP
cls
echo [정지] 서버를 중지합니다...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
echo 완료.
echo.
pause
goto MENU

:RESTART
cls
echo [재시작] 서버를 중지 후 재실행합니다...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
timeout /t 2 /nobreak >nul
goto START
