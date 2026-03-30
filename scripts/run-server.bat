@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

:MENU
title 대부중개 전산시스템
cls
echo ==========================================
echo    대부중개 전산시스템 관리
echo ==========================================
echo.
echo    1. 서버 시작
echo    2. 서버 중지
echo    3. 서버 재시작
echo    4. 종료
echo.
set choice=
set /p choice="선택: "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto STOP
if "%choice%"=="3" goto RESTART
if "%choice%"=="4" goto QUIT
goto MENU

:START
echo.
call :KILLPORT
if not exist node_modules (
    echo [설치] npm install 실행 중...
    call npm install
    echo.
)
echo [시작] 서버를 백그라운드로 시작합니다...
set PROJDIR=%cd%
start /min "node-server" cmd /k "cd /d %PROJDIR% && node src/index.js"
ping 127.0.0.1 -n 3 >nul
echo [완료] 서버가 시작되었습니다.
echo        http://localhost:3000
echo.
pause
goto MENU

:STOP
echo.
call :KILLNODE
echo.
pause
goto MENU

:RESTART
echo.
call :KILLNODE
ping 127.0.0.1 -n 2 >nul
if not exist node_modules (
    echo [설치] npm install 실행 중...
    call npm install
    echo.
)
echo [시작] 서버를 백그라운드로 시작합니다...
set PROJDIR=%cd%
start /min "node-server" cmd /k "cd /d %PROJDIR% && node src/index.js"
ping 127.0.0.1 -n 3 >nul
echo [완료] 서버가 재시작되었습니다.
echo        http://localhost:3000
echo.
pause
goto MENU

:QUIT
call :KILLNODE
exit

:KILLPORT
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo [정리] 포트 3000 사용 중인 프로세스 종료 (PID:%%p)
    taskkill /PID %%p /F >nul 2>&1
)
goto :eof

:KILLNODE
echo [중지] 서버를 중지합니다...
taskkill /F /IM node.exe >nul 2>&1
call :KILLPORT
echo [완료] 서버가 중지되었습니다.
goto :eof
