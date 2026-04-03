@echo off
chcp 65001 >nul
title DailyFNI - Blog Automation System

:MENU
cls
echo ================================================
echo   DailyFNI - 네이버 블로그 자동화 솔루션
echo ================================================
echo.
echo   1. 전체 시작 (백엔드 + Python + 프론트엔드)
echo   2. 전체 중지
echo   3. 백엔드만 시작 (Node.js :3000)
echo   4. Python만 시작 (FastAPI :8000)
echo   5. 프론트엔드만 시작 (Vite :5173)
echo   6. 초기 설치 (최초 1회)
echo   7. Playwright 설치 (블로그 발행용)
echo   8. 초기 데이터 시드 (샘플 계정/콘텐츠 생성)
echo   9. 데이터 초기화 (DB 삭제)
echo   0. 종료
echo.
set /p CHOICE=선택:

if "%CHOICE%"=="1" goto START_ALL
if "%CHOICE%"=="2" goto STOP_ALL
if "%CHOICE%"=="3" goto START_BACKEND
if "%CHOICE%"=="4" goto START_PYTHON
if "%CHOICE%"=="5" goto START_FRONTEND
if "%CHOICE%"=="6" goto SETUP
if "%CHOICE%"=="7" goto PLAYWRIGHT
if "%CHOICE%"=="8" goto SEED
if "%CHOICE%"=="9" goto RESET
if "%CHOICE%"=="0" goto EOF
echo 잘못된 입력입니다.
pause
goto MENU

:START_ALL
cls
echo [1/3] Node.js 백엔드 시작 중...
start "DailyFNI-Backend" cmd /k "cd /d "%~dp0" && node src/index.js"
timeout /t 2 /nobreak >nul

echo [2/3] Python FastAPI 시작 중...
start "DailyFNI-Python" cmd /k "cd /d "%~dp0blog-generator\backend" && uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 2 /nobreak >nul

echo [3/3] 프론트엔드 시작 중...
start "DailyFNI-Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo ================================================
echo   서버가 시작되었습니다!
echo.
echo   대시보드:  http://localhost:5173
echo   백엔드:    http://localhost:3000/api/health
echo   Python:    http://localhost:8000/api/health
echo ================================================
echo.
pause
goto MENU

:STOP_ALL
cls
echo 모든 서버를 중지합니다...
taskkill /fi "WINDOWTITLE eq DailyFNI-Backend*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Python*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq DailyFNI-Frontend*" /f >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
echo 완료.
pause
goto MENU

:START_BACKEND
cls
echo Node.js 백엔드 시작...
start "DailyFNI-Backend" cmd /k "cd /d "%~dp0" && node src/index.js"
echo 시작됨: http://localhost:3000
pause
goto MENU

:START_PYTHON
cls
echo Python FastAPI 시작...
start "DailyFNI-Python" cmd /k "cd /d "%~dp0blog-generator\backend" && uvicorn main:app --host 0.0.0.0 --port 8000"
echo 시작됨: http://localhost:8000
pause
goto MENU

:START_FRONTEND
cls
echo 프론트엔드 시작...
start "DailyFNI-Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
echo 시작됨: http://localhost:5173
pause
goto MENU

:SETUP
cls
echo ================================================
echo   초기 설치 (최초 1회만 실행)
echo ================================================
echo.

echo [1/3] Node.js 의존성 설치...
cd /d "%~dp0"
call npm install

echo.
echo [2/3] Python 의존성 설치...
cd /d "%~dp0blog-generator"
pip install -r requirements.txt

echo.
echo [3/3] 프론트엔드 의존성 설치...
cd /d "%~dp0frontend"
call npm install

echo.
echo ================================================
echo   설치 완료!
echo   .env 파일에 API 키를 설정하세요:
echo   ANTHROPIC_API_KEY=sk-ant-api03-...
echo ================================================
pause
goto MENU

:PLAYWRIGHT
cls
echo Playwright 브라우저 설치 중...
cd /d "%~dp0blog-generator"
pip install playwright playwright-stealth
playwright install chromium
echo.
echo Playwright 설치 완료!
pause
goto MENU

:SEED
cls
echo 초기 데이터를 생성합니다 (기존 데이터 초기화 포함)...
cd /d "%~dp0"
node scripts/seed.js
pause
goto MENU

:RESET
cls
echo 데이터베이스를 초기화합니다...
set /p CONFIRM=정말 삭제하시겠습니까? (y/n):
if /i "%CONFIRM%"=="y" (
  del /q "%~dp0data\dailyfni.db" 2>nul
  del /q "%~dp0data\dailyfni.db-wal" 2>nul
  del /q "%~dp0data\dailyfni.db-shm" 2>nul
  echo DB 파일이 삭제되었습니다. 서버 재시작 시 빈 DB가 생성됩니다.
) else (
  echo 취소되었습니다.
)
pause
goto MENU

:EOF
exit
