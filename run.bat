@echo off
chcp 65001 >nul
cd /d "%~dp0"

:MENU
title 대부중개 전산시스템
cls
echo ========================================
echo   대부중개 전산시스템 관리
echo ========================================
echo.
echo   1. 서버 시작
echo   2. 서버 중지
echo   3. 서버 재시작
echo   4. 종료
echo.
set choice=
set /p choice="선택: "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto STOP
if "%choice%"=="3" goto RESTART
if "%choice%"=="4" goto END
goto MENU

:STOP
echo.
echo [중지] 서버를 중지합니다...
taskkill /F /IM node.exe >nul 2>&1
echo [완료] 서버가 중지되었습니다.
echo.
pause
goto MENU

:RESTART
echo.
echo [재시작] 서버를 중지합니다...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
goto RUNSERVER

:START
echo.

:RUNSERVER
echo [시작] 포트 3000 확인 중...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

if not exist "node_modules" (
    echo [설치] npm install 실행 중...
    call npm install
    echo.
)

echo [시작] 서버를 시작합니다...
echo        종료 후 메뉴로 돌아가려면 Ctrl+C 를 누르세요.
echo ========================================
title 대부중개 서버 - localhost:3000
echo.
node src/index.js
echo.
echo ========================================
echo [알림] 서버가 종료되었습니다.
echo ========================================
echo.
pause
goto MENU

:END
taskkill /F /IM node.exe >nul 2>&1
exit
