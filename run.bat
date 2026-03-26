@echo off
chcp 65001 >nul
title 대부중개 전산시스템
cd /d "%~dp0"

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
set /p choice="선택: "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto STOP
if "%choice%"=="3" goto RESTART
if "%choice%"=="4" exit
goto MENU

:START
echo.
echo [시작] 포트 3000 확인 중...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo [경고] 포트 3000 사용 중 (PID: %%a). 종료합니다...
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)
echo [시작] 서버를 시작합니다...
start "대부중개 서버" "%~dp0_server.bat"
timeout /t 3 /nobreak >nul
echo.
echo [완료] 서버가 시작되었습니다.
echo        브라우저에서 http://localhost:3000 접속하세요.
echo        (서버 로그는 새로 열린 CMD 창에서 확인)
echo.
pause
goto MENU

:STOP
echo.
echo [중지] 서버를 중지합니다...
set found=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo [완료] 서버가 중지되었습니다. (PID: %%a)
    set found=1
)
if "%found%"=="0" echo [알림] 실행 중인 서버가 없습니다.
echo.
pause
goto MENU

:RESTART
echo.
echo [재시작] 서버를 중지합니다...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo [재시작] 서버를 시작합니다...
start "대부중개 서버" "%~dp0_server.bat"
timeout /t 3 /nobreak >nul
echo.
echo [완료] 서버가 재시작되었습니다.
echo        브라우저에서 http://localhost:3000 접속하세요.
echo.
pause
goto MENU
