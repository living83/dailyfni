"""
watchdog.py — 서버 헬스 체크 & 자동 재시작 스크립트
2시간마다 블로그/카페 백엔드 서버를 체크하고,
죽어있으면 텔레그램 알림 + 자동 재시작합니다.
"""
import time
import subprocess
import httpx
import asyncio
import json
import os
import shutil
from pathlib import Path
from datetime import datetime

# ─────────────────────────────────────────────
# 설정
# ─────────────────────────────────────────────
CHECK_INTERVAL_SECONDS = 10 * 60   # 10분

SERVERS = [
    {
        "name": "블로그 자동화",
        "health_url": "http://localhost:8000/api/health",
        "start_vbs": r"C:\Users\BH04\.cache\dailyfni\naver_blog_auto\start_backend.vbs",
    },
    {
        "name": "카페 자동화",
        "health_url": "http://localhost:8001/api/health",
        "start_vbs": r"C:\Users\BH04\.cache\dailyfni\naver-cafe-auto\start_backend.vbs",
    },
]

# 텔레그램 설정 파일 위치
TELEGRAM_CONFIG = r"C:\Users\BH04\.cache\dailyfni\naver_blog_auto\config\telegram.json"

# 백업 설정
BACKUP_DIR = r"C:\Users\BH04\.cache\dailyfni\backups"
BACKUP_TARGET_DIRS = [
    r"C:\Users\BH04\.cache\dailyfni\naver-cafe-auto\data",
]
LAST_BACKUP_DATE_FILE = os.path.join(BACKUP_DIR, "last_backup.txt")

# ─────────────────────────────────────────────
# 백업 자동화
# ─────────────────────────────────────────────
def run_daily_backup():
    today_str = datetime.now().strftime("%Y-%m-%d")
    
    os.makedirs(BACKUP_DIR, exist_ok=True)
    
    # 오늘 이미 백업했는지 확인
    if os.path.exists(LAST_BACKUP_DATE_FILE):
        with open(LAST_BACKUP_DATE_FILE, "r", encoding="utf-8") as f:
            if f.read().strip() == today_str:
                return # 이미 백업 완료
                
    print(f"[Watchdog] 일일 자동 백업 시작 ({today_str})")
    try:
        backup_count = 0
        for target_dir in BACKUP_TARGET_DIRS:
            if not os.path.exists(target_dir):
                continue
            
            for file_name in os.listdir(target_dir):
                if file_name.endswith(".db"):
                    src = os.path.join(target_dir, file_name)
                    dest_folder = os.path.join(BACKUP_DIR, today_str)
                    os.makedirs(dest_folder, exist_ok=True)
                    dest = os.path.join(dest_folder, file_name)
                    
                    shutil.copy2(src, dest)
                    backup_count += 1
                    
        with open(LAST_BACKUP_DATE_FILE, "w", encoding="utf-8") as f:
            f.write(today_str)
            
        print(f"[Watchdog] 백업 완료 (총 {backup_count}개의 DB 파일 백업됨)")
        if backup_count > 0:
            send_telegram(f"💾 <b>[자동 백업 완료]</b>\n{backup_count}개의 DB가 안전하게 백업되었습니다.\n({today_str})")
    except Exception as e:
        print(f"[Watchdog] 백업 중 예외 발생: {e}")
        send_telegram(f"🚨 <b>[자동 백업 실패]</b>\n원인: {str(e)}")


# ─────────────────────────────────────────────
# 텔레그램 알림
# ─────────────────────────────────────────────
def _load_telegram_config():
    try:
        with open(TELEGRAM_CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def send_telegram(message: str):
    cfg = _load_telegram_config()
    if not cfg or not cfg.get("bot_token") or not cfg.get("chat_id"):
        print(f"[Watchdog] 텔레그램 설정 없음 — 알림 건너뜀")
        return
    url = f"https://api.telegram.org/bot{cfg['bot_token']}/sendMessage"
    try:
        import urllib.request
        data = json.dumps({"chat_id": cfg["chat_id"], "text": message, "parse_mode": "HTML"}).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
        print(f"[Watchdog] 텔레그램 전송 완료")
    except Exception as e:
        print(f"[Watchdog] 텔레그램 전송 실패: {e}")

# ─────────────────────────────────────────────
# 헬스 체크
# ─────────────────────────────────────────────
def is_alive(health_url: str) -> bool:
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(health_url)
            return r.status_code == 200
    except Exception:
        return False

def restart_server(vbs_path: str):
    try:
        subprocess.Popen(["wscript", vbs_path], shell=True)
        return True
    except Exception as e:
        print(f"[Watchdog] 재시작 실패: {e}")
        return False

# ─────────────────────────────────────────────
# 메인 루프
# ─────────────────────────────────────────────
def run_watchdog():
    print(f"[Watchdog] 서버 감시 시작 (체크 주기: {CHECK_INTERVAL_SECONDS // 60}분)")
    while True:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # 1. 일일 백업 진행
        run_daily_backup()
        
        # 2. 상태 감시
        for server in SERVERS:
            name = server["name"]
            url = server["health_url"]
            vbs = server["start_vbs"]

            alive = is_alive(url)
            status = "✅ 정상" if alive else "❌ 다운"
            print(f"[Watchdog] [{now}] {name}: {status}")

            if not alive:
                msg = (
                    f"⚠️ <b>[서버 다운 감지]</b>\n"
                    f"🔴 {name} 서버가 응답하지 않습니다.\n"
                    f"🔄 자동 재시작을 시도합니다...\n"
                    f"🕐 시각: {now}"
                )
                send_telegram(msg)
                success = restart_server(vbs)
                time.sleep(5)  # 재시작 대기
                # 재시작 후 재확인
                alive_after = is_alive(url)
                if alive_after:
                    send_telegram(f"✅ <b>{name}</b> 서버 재시작 완료!")
                else:
                    send_telegram(f"🚨 <b>{name}</b> 서버 재시작 실패! 수동 확인이 필요합니다.")

        print(f"[Watchdog] 다음 체크까지 {CHECK_INTERVAL_SECONDS // 60}분 대기...")
        time.sleep(CHECK_INTERVAL_SECONDS)

if __name__ == "__main__":
    run_watchdog()
