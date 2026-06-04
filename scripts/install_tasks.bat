@echo off
chcp 65001 >nul
REM ===============================================
REM  DailyFNI - Windows 작업스케줄러 자동 등록
REM  관리자 권한으로 실행하세요!
REM
REM  등록 작업:
REM  1) DailyFNI_Backup     - 매일 새벽 3시 DB 백업
REM  2) DailyFNI_Healthcheck - 5분마다 헬스체크
REM  3) DailyFNI_Autostart   - 부팅 시 자동 시작
REM ===============================================

cd /d "%~dp0\.."
set "BASE=%cd%"

echo.
echo ================================================
echo   DailyFNI 작업스케줄러 자동 등록
echo ================================================
echo   설치 경로: %BASE%
echo.

REM 관리자 권한 확인
net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 관리자 권한이 필요합니다!
  echo         이 파일을 마우스 우클릭 ^> "관리자 권한으로 실행"
  pause
  exit /b 1
)

REM 1. DB 백업 - 매일 03:00
schtasks /create /tn "DailyFNI_Backup" /tr "\"%BASE%\scripts\backup_db.bat\"" /sc daily /st 03:00 /rl highest /f
if errorlevel 1 (echo [FAIL] 백업 작업 등록 실패) else (echo [OK] DailyFNI_Backup 등록 완료 - 매일 03:00)

REM 2. 헬스체크 - 5분마다
schtasks /create /tn "DailyFNI_Healthcheck" /tr "\"%BASE%\scripts\healthcheck.bat\"" /sc minute /mo 5 /rl highest /f
if errorlevel 1 (echo [FAIL] 헬스체크 등록 실패) else (echo [OK] DailyFNI_Healthcheck 등록 완료 - 5분 간격)

REM 3. 부팅 시 자동 시작
schtasks /create /tn "DailyFNI_Autostart" /tr "wscript \"%BASE%\start_hidden.vbs\"" /sc onstart /delay 0001:00 /rl highest /f
if errorlevel 1 (echo [FAIL] 자동시작 등록 실패) else (echo [OK] DailyFNI_Autostart 등록 완료 - 부팅 1분 후)

echo.
echo ================================================
echo   완료! 등록된 작업 확인:
echo ================================================
schtasks /query /tn "DailyFNI_Backup" /fo list 2>nul | findstr /i "TaskName Next"
schtasks /query /tn "DailyFNI_Healthcheck" /fo list 2>nul | findstr /i "TaskName Next"
schtasks /query /tn "DailyFNI_Autostart" /fo list 2>nul | findstr /i "TaskName Next"
echo.
echo 제거하려면: scripts\uninstall_tasks.bat
echo.
pause
