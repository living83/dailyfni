@echo off
chcp 65001 >nul
REM ===============================================
REM  DailyFNI - 작업스케줄러 제거
REM  관리자 권한으로 실행하세요
REM ===============================================

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 관리자 권한이 필요합니다!
  pause
  exit /b 1
)

schtasks /delete /tn "DailyFNI_Backup" /f 2>nul && echo [OK] DailyFNI_Backup 제거됨
schtasks /delete /tn "DailyFNI_Healthcheck" /f 2>nul && echo [OK] DailyFNI_Healthcheck 제거됨
schtasks /delete /tn "DailyFNI_Autostart" /f 2>nul && echo [OK] DailyFNI_Autostart 제거됨

echo.
echo 모든 작업이 제거되었습니다.
pause
