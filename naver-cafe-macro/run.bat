@echo off
chcp 65001 >nul
title DailyFNI - 네이버 카페 매크로

echo ========================================
echo   DailyFNI Cafe Macro Server
echo ========================================
echo.

:: 의존성 설치 확인
echo [1/2] 패키지 확인 중...
pip install -r "%~dp0requirements.txt" --quiet

echo [2/2] 서버 시작 중...
echo.
echo   http://localhost:8001 에서 접속하세요
echo   종료하려면 Ctrl+C 를 누르세요
echo.
echo ========================================

cd /d "%~dp0backend"
python main.py

pause
