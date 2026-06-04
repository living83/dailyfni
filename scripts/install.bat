@echo off
chcp 65001 >nul
title DailyFNI - 최초 설치 스크립트
cd /d "%~dp0\.."

echo ================================================
echo   DailyFNI 최초 설치 (이 PC에 블로그 시스템 설치)
echo ================================================
echo.
echo   이 스크립트는 다음을 자동 수행합니다:
echo     1. Node.js 의존성 설치 (npm install)
echo     2. Frontend 의존성 설치
echo     3. Python 가상환경 + 의존성 설치
echo     4. Playwright 브라우저 설치
echo     5. .env 파일 생성 (없는 경우)
echo     6. 데이터/백업 폴더 생성
echo.
echo   [사전 요구사항] 아래가 미리 설치되어 있어야 합니다:
echo     - Node.js 18 이상   (https://nodejs.org)
echo     - Python 3.10 이상  (https://python.org)
echo     - Git              (https://git-scm.com)
echo.
pause

REM ── 사전 도구 검사 ──
echo.
echo [1/6] 사전 도구 검사...
where node >nul 2>&1 || (echo [ERROR] Node.js 미설치 - https://nodejs.org 에서 설치 후 재실행 & pause & exit /b 1)
where npm >nul 2>&1 || (echo [ERROR] npm 미설치 & pause & exit /b 1)
where python >nul 2>&1 || (echo [ERROR] Python 미설치 - https://python.org 에서 설치 후 재실행 & pause & exit /b 1)
echo   [OK] Node.js, npm, Python 확인 완료

REM ── Node 백엔드 ──
echo.
echo [2/6] Node.js 백엔드 의존성 설치...
call npm install
if errorlevel 1 (echo [ERROR] npm install 실패 & pause & exit /b 1)
echo   [OK] Node 의존성 설치 완료

REM ── Frontend ──
echo.
echo [3/6] Frontend 의존성 설치...
cd frontend
call npm install
if errorlevel 1 (echo [ERROR] frontend npm install 실패 & pause & exit /b 1)
cd ..
echo   [OK] Frontend 의존성 설치 완료

REM ── Python venv + deps ──
echo.
echo [4/6] Python 가상환경 + 의존성 설치...
cd blog-generator
if not exist "venv" (
  python -m venv venv
  if errorlevel 1 (echo [ERROR] venv 생성 실패 & pause & exit /b 1)
)
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (echo [ERROR] pip install 실패 & pause & exit /b 1)
echo   [OK] Python 의존성 설치 완료

REM ── Playwright 브라우저 ──
echo.
echo [5/6] Playwright 브라우저 설치 (시간이 좀 걸립니다)...
python -m playwright install chromium
if errorlevel 1 (echo [WARN] Playwright 브라우저 설치 실패 - 수동 실행 필요)
echo   [OK] Playwright Chromium 설치 완료
call deactivate
cd ..

REM ── .env / 폴더 ──
echo.
echo [6/6] 환경 설정 및 폴더 생성...
if not exist "data" mkdir data
if not exist "backup" mkdir backup
if not exist "logs" mkdir logs
if not exist ".env" (
  echo # DailyFNI 환경변수 - 실제 값으로 채워주세요> .env
  echo ANTHROPIC_API_KEY=>> .env
  echo NAVER_CLIENT_ID=>> .env
  echo NAVER_CLIENT_SECRET=>> .env
  echo TELEGRAM_BOT_TOKEN=>> .env
  echo TELEGRAM_CHAT_ID=>> .env
  echo PORT=3000>> .env
  echo PYTHON_URL=http://localhost:8000>> .env
  echo   [OK] .env 템플릿 생성됨 - 값을 채워주세요!
) else (
  echo   [SKIP] .env 이미 존재
)

echo.
echo ================================================
echo   설치 완료!
echo ================================================
echo.
echo   다음 단계:
echo     1. .env 파일을 열어 API 키들을 입력하세요
echo     2. run.bat 실행 → 1번 메뉴로 서버 시작
echo     3. 브라우저에서 http://localhost:5173 접속
echo.
echo   24시간 운영 설정 (선택):
echo     scripts\install_tasks.bat 우클릭 - 관리자 권한으로 실행
echo.
pause
