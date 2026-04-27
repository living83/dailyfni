import sqlite3
import re

conn = sqlite3.connect('c:/Users/BH04/.cache/dailyfni/naver-cafe-auto/data/cafe_macro.db')
conn.row_factory = sqlite3.Row

row = conn.execute("SELECT id, content, status FROM publish_history ORDER BY id DESC LIMIT 1").fetchone()
if row:
    print(f"ID: {row['id']} | Status: {row['status']}")
    content = row['content']
    print(f"Content length: {len(content)}")
    
    # Check for the footer link text
    if '홈페이지문의' in content or 'https://home.dailyfni.co.kr' in content:
        print("✅ 하단 링크(홈페이지문의 / https://home.dailyfni.co.kr)가 본문에 정상적으로 포함되어 있습니다.")
        # Print the last few lines to show it
        lines = content.split('\n')
        print("--- 본문 마지막 부분 ---")
        for line in lines[-10:]:
            print(line[:100])
    else:
        print("❌ 하단 링크 설정값을 본문에서 찾을 수 없습니다.")

conn.close()
