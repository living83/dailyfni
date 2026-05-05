@echo off
chcp 65001 >nul
echo ============================================
echo   키워드 300개 + 댓글 102개 초기화 중...
echo ============================================
cd /d "%~dp0"
python -c "import sys; sys.path.insert(0,'backend'); from seed_data import reseed; import sqlite3; conn=sqlite3.connect('data/cafe_macro.db'); reseed(conn); conn.close()"
echo.
echo ============================================
echo   완료! 이 창을 닫고 run.bat을 다시 실행하세요.
echo ============================================
pause
