@echo off
chcp 65001 >nul
REM ===============================================
REM  DailyFNI - 헬스체크 + 자동 재시작
REM  작업스케줄러로 5분마다 실행 권장
REM  - 포트 3000 (Node), 8000 (FastAPI) 점검
REM  - 죽었으면 start_hidden.vbs로 자동 재시작
REM ===============================================

setlocal enabledelayedexpansion
cd /d "%~dp0\.."

set "LOG=backup\health.log"
if not exist "backup" mkdir "backup"

set "NODE_OK=0"
set "PY_OK=0"

REM 포트 3000 LISTENING 확인
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul && set "NODE_OK=1"

REM 포트 8000 LISTENING 확인
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul && set "PY_OK=1"

REM 추가: HTTP 응답까지 확인 (Invoke-WebRequest로 실제 200 검사)
if "%NODE_OK%"=="1" (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -TimeoutSec 5 -UseBasicParsing; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }" >nul 2>&1
  if errorlevel 1 set "NODE_OK=0"
)

if "%NODE_OK%"=="1" if "%PY_OK%"=="1" (
  echo [%date% %time%] OK - Node:UP Python:UP >> "%LOG%"
  exit /b 0
)

REM ── 비정상: 재시작 ──
echo [%date% %time%] FAIL - Node:%NODE_OK% Python:%PY_OK% >> "%LOG%"
echo [%date% %time%] Restarting servers... >> "%LOG%"

REM 죽은 프로세스 모두 정리 (포트 점유 해제)
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im uvicorn.exe >nul 2>&1
timeout /t 3 /nobreak >nul

REM 재시작
wscript "%~dp0\..\start_hidden.vbs"
timeout /t 8 /nobreak >nul

REM 재시작 후 재검증
set "NODE_OK2=0"
set "PY_OK2=0"
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul && set "NODE_OK2=1"
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul && set "PY_OK2=1"

if "%NODE_OK2%"=="1" if "%PY_OK2%"=="1" (
  echo [%date% %time%] RESTART OK >> "%LOG%"

  REM 텔레그램 알림 (선택) — .env에서 토큰/챗ID 읽기
  for /f "tokens=1,2 delims==" %%a in ('findstr /b "TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID" .env 2^>nul') do (
    if "%%a"=="TELEGRAM_BOT_TOKEN" set "TG_TOKEN=%%b"
    if "%%a"=="TELEGRAM_CHAT_ID" set "TG_CHAT=%%b"
  )
  if defined TG_TOKEN if defined TG_CHAT (
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri ('https://api.telegram.org/bot!TG_TOKEN!/sendMessage?chat_id=!TG_CHAT!&text=' + [uri]::EscapeDataString('[DailyFNI] 서버 자동 재시작 완료')) -UseBasicParsing -TimeoutSec 5 | Out-Null } catch {}" >nul 2>&1
  )
) else (
  echo [%date% %time%] RESTART FAIL - Node:%NODE_OK2% Python:%PY_OK2% >> "%LOG%"

  for /f "tokens=1,2 delims==" %%a in ('findstr /b "TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID" .env 2^>nul') do (
    if "%%a"=="TELEGRAM_BOT_TOKEN" set "TG_TOKEN=%%b"
    if "%%a"=="TELEGRAM_CHAT_ID" set "TG_CHAT=%%b"
  )
  if defined TG_TOKEN if defined TG_CHAT (
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri ('https://api.telegram.org/bot!TG_TOKEN!/sendMessage?chat_id=!TG_CHAT!&text=' + [uri]::EscapeDataString('[DailyFNI] 서버 자동 재시작 실패! 수동 확인 필요')) -UseBasicParsing -TimeoutSec 5 | Out-Null } catch {}" >nul 2>&1
  )
)

endlocal
exit /b 0
