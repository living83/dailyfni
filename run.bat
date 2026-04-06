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

echo [1/3] Node.js 백엔드 (포트 3000)...
start "DailyFNI-Backend" /min cmd /c "cd /d "%~dp0" && node src/index.js"
timeout /t 2 /nobreak >nul
echo       OK

echo [2/3] Python FastAPI (포트 8000)...
start "DailyFNI-Python" /min cmd /c "cd /d "%~dp0blog-generator\backend" && uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 2 /nobreak >nul
echo       OK

echo [3/3] 프론트엔드 (포트 5173)...
start "DailyFNI-Frontend" /min cmd /c "cd /d "%~dp0frontend" && npx vite --host 0.0.0.0 --port 5173"
timeout /t 3 /nobreak >nul
echo       OK

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
taskkill /fi "WINDOWTITLE eq DailyFNI-Backend*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Python*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Frontend*" /f >nul 2>&1
echo 완료.
echo.
echo 아무 키나 누르면 메뉴로 돌아갑니다...
pause >nul
goto MENU

:RESTART
cls
echo [재시작] 서버를 중지 후 재실행합니다...
taskkill /fi "WINDOWTITLE eq DailyFNI-Backend*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Python*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Frontend*" /f >nul 2>&1
timeout /t 2 /nobreak >nul
goto START
