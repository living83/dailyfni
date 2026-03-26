@echo off
chcp 65001 >nul
title 대부중개 전산시스템

:MENU
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
set /p choice=선택:

if "%choice%"=="1" goto START
if "%choice%"=="2" goto STOP
if "%choice%"=="3" goto RESTART
if "%choice%"=="4" exit
goto MENU

:START
echo.
echo [시작] 포트 3000 확인 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo [경고] 포트 3000 사용 중 (PID: %%a). 종료합니다...
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 1 >nul
)
echo [시작] 서버를 시작합니다...
start /b cmd /c "node src/index.js > nul 2>&1"
timeout /t 2 >nul
echo [완료] http://localhost:3000 에서 접속하세요.
echo.
pause
goto MENU

:STOP
echo.
echo [중지] 서버를 중지합니다...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
    echo [완료] 서버가 중지되었습니다. (PID: %%a)
)
echo.
pause
goto MENU

:RESTART
echo.
echo [재시작] 서버를 중지합니다...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 >nul
echo [재시작] 서버를 시작합니다...
start /b cmd /c "node src/index.js > nul 2>&1"
timeout /t 2 >nul
echo [완료] http://localhost:3000 에서 접속하세요.
echo.
pause
goto MENU
