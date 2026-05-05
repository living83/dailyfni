import sqlite3
import urllib.request
import json

# DB 설정 확인
conn = sqlite3.connect('data/cafe_macro.db')
conn.row_factory = sqlite3.Row
cfg = conn.execute('SELECT base_start_hour, base_start_minute, times, days FROM schedule_config LIMIT 1').fetchone()
print('=== DB 스케줄 설정 ===')
for k in cfg.keys(): print(f'  {k}: {cfg[k]}')

# 최근 발행 이력
print('\n=== 오늘 발행 내역 ===')
rows = conn.execute('''
    SELECT ph.id, a.username, cb.board_name, ph.status, ph.created_at, ph.error_message
    FROM publish_history ph
    LEFT JOIN accounts a ON ph.account_id = a.id
    LEFT JOIN cafe_boards cb ON ph.board_id = cb.id
    WHERE date(ph.created_at) = date('now', 'localtime')
    ORDER BY ph.id DESC LIMIT 10
''').fetchall()
for r in rows:
    d = dict(r)
    if d.get('error_message') and len(d['error_message']) > 40:
        d['error_message'] = d['error_message'][:40] + '...'
    print(d)

conn.close()

# APScheduler 잡 API 확인
try:
    with urllib.request.urlopen('http://localhost:8001/api/scheduler/jobs', timeout=5) as resp:
        data = resp.read().decode()
        print('\n=== 등록된 스케줄 잡 ===')
        print(data[:500])
except Exception as e:
    print(f'\n/api/scheduler/jobs 없음 또는 실패: {e}')

# health 확인
try:
    with urllib.request.urlopen('http://localhost:8001/api/health', timeout=5) as resp:
        print('\n=== Health ===')
        print(resp.read().decode())
except Exception as e:
    print(f'Health 실패: {e}')
