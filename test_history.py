import sqlite3
import datetime

conn = sqlite3.connect('data/cafe_macro.db')
conn.row_factory = sqlite3.Row

print('=== 오늘 새벽(0시~6시) 및 최근 발행 내역 ===')
rows = conn.execute('''
    SELECT ph.id, a.username, cb.board_name, cb.cafe_url, ph.status, ph.error_message, ph.created_at
    FROM publish_history ph
    LEFT JOIN accounts a ON ph.account_id = a.id
    LEFT JOIN cafe_boards cb ON ph.board_id = cb.id
    WHERE ph.created_at >= date('now', '-1 days')
    ORDER BY ph.created_at DESC LIMIT 30
''').fetchall()

for row in rows:
    d = dict(row)
    if d['error_message'] and len(d['error_message']) > 30:
        d['error_message'] = d['error_message'][:30] + '...'
    print(d)
    
print('\n=== 스케줄 설정 ===')
try:
    config = conn.execute('SELECT * FROM schedule_config LIMIT 1').fetchone()
    if config:
        for k, v in dict(config).items():
            print(f"{k}: {v}")
    else:
        print('No config found in schedule_config')
except Exception as e:
    print('Failed to read schedule_config:', e)

conn.close()

with open('logs/scheduler.log', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()
    print('\n=== scheduler.log 오늘 스케줄 내역 ===')
    for line in lines[-100:]:
        if '스케줄' in line or '발행' in line or 'schedule' in line.lower() or 'started' in line.lower():
            print(line.strip())
