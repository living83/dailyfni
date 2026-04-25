@echo off
chcp 65001 >nul
REM ===============================================
REM  DailyFNI - DB 자동 백업 스크립트
REM  매일 새벽 3시 작업스케줄러로 실행 권장
REM  - data/dailyfni.db → backup/dailyfni_YYYYMMDD.db
REM  - 30일 이상 백업 자동 삭제
REM ===============================================

setlocal enabledelayedexpansion
cd /d "%~dp0\.."

set "SRC=data\dailyfni.db"
set "BACKUP_DIR=backup"
set "RETENTION_DAYS=30"

if not exist "%SRC%" (
  echo [ERROR] DB 파일이 없습니다: %SRC%
  exit /b 1
)

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM 날짜 (YYYYMMDD) - locale 무관
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "DEST=%BACKUP_DIR%\dailyfni_%STAMP%.db"

REM SQLite Online Backup (잠금 안전) — sqlite3 CLI 있으면 사용
where sqlite3 >nul 2>&1
if %errorlevel%==0 (
  sqlite3 "%SRC%" ".backup '%DEST%'"
) else (
  copy /y "%SRC%" "%DEST%" >nul
)

if exist "%DEST%" (
  echo [OK] 백업 완료: %DEST%
) else (
  echo [FAIL] 백업 실패
  exit /b 1
)

REM 30일 이상 백업 삭제
forfiles /p "%BACKUP_DIR%" /m "dailyfni_*.db" /d -%RETENTION_DAYS% /c "cmd /c del @path" >nul 2>&1
echo [OK] %RETENTION_DAYS%일 이상 백업 정리 완료

REM 로그
echo [%date% %time%] Backup OK -> %DEST% >> "%BACKUP_DIR%\backup.log"

endlocal
exit /b 0
