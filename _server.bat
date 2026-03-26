@echo off
chcp 65001 >nul
title 대부중개 서버 (localhost:3000)
cd /d "%~dp0"
echo.
echo ========================================
echo   대부중개 서버 실행 중
echo   http://localhost:3000
echo   종료하려면 Ctrl+C 또는 창을 닫으세요
echo ========================================
echo.
node src/index.js
echo.
echo [오류] 서버가 종료되었습니다. 위 에러 메시지를 확인하세요.
pause
