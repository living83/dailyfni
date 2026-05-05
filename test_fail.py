import sqlite3

conn = sqlite3.connect('c:/Users/BH04/.cache/dailyfni/naver-cafe-auto/data/cafe_macro.db')
conn.row_factory = sqlite3.Row

# Get recent failure
row = conn.execute("SELECT id, status, error_message, content FROM publish_history ORDER BY id DESC LIMIT 1").fetchone()
if row:
    d = dict(row)
    del d['content']
    print(d)

conn.close()
