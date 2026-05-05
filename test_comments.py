import sqlite3

conn = sqlite3.connect('data/cafe_macro.db')
conn.row_factory = sqlite3.Row

print('=== 최근 발행 내역 ===')
rows = conn.execute('''
    SELECT ph.id, a.username, cb.board_name, ph.status, ph.created_at, ph.error_message
    FROM publish_history ph
    LEFT JOIN accounts a ON ph.account_id = a.id
    LEFT JOIN cafe_boards cb ON ph.board_id = cb.id
    ORDER BY ph.id DESC LIMIT 3
''').fetchall()
for row in rows:
    print(dict(row))

print('\n=== 최근 댓글 내역 ===')
rows = conn.execute('''
    SELECT ch.id, ch.publish_id, a.username, ch.status, ch.error_message
    FROM comment_history ch
    LEFT JOIN accounts a ON ch.account_id = a.id
    WHERE date(ch.created_at) = date('now', 'localtime')
    ORDER BY ch.id DESC LIMIT 10
''').fetchall()
for row in rows:
    print(dict(row))

conn.close()
