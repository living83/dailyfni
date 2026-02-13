@echo off
chcp 65001 >nul
REM ============================================
REM  네이버 블로그 상품 설명 자동 생성기 실행 스크립트
REM  사용법: run.bat 더블클릭
REM ============================================

echo ================================================
echo   DailyFNI - 네이버 블로그 상품 설명 자동 생성기
echo ================================================
echo.

REM Python 확인
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo   https://www.python.org/downloads/ 에서 Python 3.9 이상을 설치해주세요.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYVER=%%i
echo [1/3] Python 확인: %PYVER%

REM 가상환경 생성
if not exist ".venv" (
    echo [2/3] 가상환경 생성 중...
    python -m venv .venv
)

REM 가상환경 활성화
call .venv\Scripts\activate.bat

REM 패키지 설치
echo [2/3] 패키지 설치 중...
pip install -q -r requirements.txt

REM 서버 실행
echo [3/3] 서버 시작 중...
echo.
echo ================================================
echo   브라우저에서 http://localhost:8000 접속하세요
echo   종료하려면 Ctrl+C 를 누르세요
echo ================================================
echo.

cd backend
python main.py

pause
