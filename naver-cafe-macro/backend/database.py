"""
database.py - SQLite 데이터베이스 관리
계정, 카페 게시판, 키워드, 발행 이력 테이블
"""

import sqlite3
import os
from datetime import datetime
from pathlib import Path

from seed_data import seed as seed_db, reseed as reseed_db

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "cafe_macro.db"


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_enc TEXT NOT NULL,
            cookie_data TEXT,
            active INTEGER DEFAULT 1,
            last_published_at TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS cafe_boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cafe_url TEXT NOT NULL,
            board_name TEXT NOT NULL,
            menu_id TEXT NOT NULL DEFAULT '',
            active INTEGER DEFAULT 1,
            last_published_at TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL UNIQUE,
            used_count INTEGER DEFAULT 0,
            last_used_at TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS comment_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS publish_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword_id INTEGER,
            board_id INTEGER,
            account_id INTEGER,
            title TEXT,
            content TEXT,
            status TEXT DEFAULT 'pending',
            published_url TEXT,
            error_message TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (keyword_id) REFERENCES keywords(id),
            FOREIGN KEY (board_id) REFERENCES cafe_boards(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );

        CREATE TABLE IF NOT EXISTS comment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            publish_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            template_id INTEGER,
            status TEXT DEFAULT 'pending',
            error_message TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (publish_id) REFERENCES publish_history(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );

        CREATE TABLE IF NOT EXISTS keyword_board_mapping (
            keyword_id INTEGER NOT NULL,
            board_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (keyword_id, board_id),
            FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE,
            FOREIGN KEY (board_id) REFERENCES cafe_boards(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS keyword_comment_mapping (
            keyword_id INTEGER NOT NULL,
            comment_template_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (keyword_id, comment_template_id),
            FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE,
            FOREIGN KEY (comment_template_id) REFERENCES comment_templates(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS schedule_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            days TEXT DEFAULT '1,1,1,1,1,0,0',
            times TEXT DEFAULT '08:00',
            interval_min INTEGER DEFAULT 5,
            random_delay_min INTEGER DEFAULT 10,
            random_delay_max INTEGER DEFAULT 120,
            comment_enabled INTEGER DEFAULT 1,
            comments_per_post INTEGER DEFAULT 6,
            comment_delay_min INTEGER DEFAULT 60,
            comment_delay_max INTEGER DEFAULT 300,
            comment_order TEXT DEFAULT 'random',
            exclude_author INTEGER DEFAULT 1,
            cross_publish INTEGER DEFAULT 1,
            account_interval_hours INTEGER DEFAULT 3,
            max_accounts_per_run INTEGER DEFAULT 30,
            base_start_hour INTEGER DEFAULT 8,
            base_start_minute INTEGER DEFAULT 0,
            daily_shift_minutes INTEGER DEFAULT 30
        );
    """)

    # 기존 DB 마이그레이션: 새 컬럼 추가
    for col, default in [
        ("max_accounts_per_run", "30"),
        ("base_start_hour", "8"),
        ("base_start_minute", "0"),
        ("daily_shift_minutes", "30"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE schedule_config ADD COLUMN {col} INTEGER DEFAULT {default}")
        except sqlite3.OperationalError:
            pass  # 이미 존재

    # 기존 설정값을 새 기본값으로 업데이트 (이전 기본값인 경우에만)
    cursor.execute("UPDATE schedule_config SET interval_min = 5 WHERE id = 1 AND interval_min = 30")
    cursor.execute("UPDATE schedule_config SET times = '08:00' WHERE id = 1 AND times = '09:00,14:00,19:00'")

    # 기본 스케줄 설정 삽입
    cursor.execute("""
        INSERT OR IGNORE INTO schedule_config (id) VALUES (1)
    """)

    conn.commit()

    # 시드 데이터 삽입 (키워드·댓글 비어 있을 때만)
    seed_db(conn)

    conn.close()


# ─── Accounts CRUD ────────────────────────────────────────

def add_account(username: str, password_enc: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO accounts (username, password_enc) VALUES (?, ?)",
        (username, password_enc)
    )
    conn.commit()
    aid = cursor.lastrowid
    conn.close()
    return aid


def get_accounts():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM accounts ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def toggle_account(account_id: int):
    conn = get_connection()
    conn.execute("UPDATE accounts SET active = 1 - active WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()


def delete_account(account_id: int):
    conn = get_connection()
    # 외래 키 참조 해제 후 계정 삭제
    conn.execute("DELETE FROM comment_history WHERE account_id = ?", (account_id,))
    conn.execute("UPDATE publish_history SET account_id = NULL WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()


def update_account_cookie(account_id: int, cookie_data: str):
    conn = get_connection()
    conn.execute("UPDATE accounts SET cookie_data = ? WHERE id = ?", (cookie_data, account_id))
    conn.commit()
    conn.close()


def update_account_last_published(account_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE accounts SET last_published_at = ? WHERE id = ?",
        (datetime.now().isoformat(), account_id)
    )
    conn.commit()
    conn.close()


# ─── Cafe Boards CRUD ─────────────────────────────────────

def add_cafe_board(cafe_url: str, board_name: str, menu_id: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO cafe_boards (cafe_url, board_name, menu_id) VALUES (?, ?, ?)",
        (cafe_url, board_name, menu_id)
    )
    conn.commit()
    bid = cursor.lastrowid
    conn.close()
    return bid


def get_cafe_boards():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM cafe_boards ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_cafe_board(board_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM cafe_boards WHERE id = ?", (board_id,))
    conn.commit()
    conn.close()


def update_board_last_published(board_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE cafe_boards SET last_published_at = ? WHERE id = ?",
        (datetime.now().isoformat(), board_id)
    )
    conn.commit()
    conn.close()


# ─── Keywords CRUD ─────────────────────────────────────────

def add_keyword(text: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO keywords (text) VALUES (?)", (text,))
    conn.commit()
    kid = cursor.lastrowid
    conn.close()
    return kid


def get_keywords():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM keywords ORDER BY id").fetchall()
    keywords = [dict(r) for r in rows]
    # 각 키워드에 매핑된 게시판/댓글 템플릿 ID 목록 추가
    for kw in keywords:
        mapped_boards = conn.execute(
            "SELECT board_id FROM keyword_board_mapping WHERE keyword_id = ?",
            (kw["id"],)
        ).fetchall()
        kw["board_ids"] = [r["board_id"] for r in mapped_boards]

        mapped_comments = conn.execute(
            "SELECT comment_template_id FROM keyword_comment_mapping WHERE keyword_id = ?",
            (kw["id"],)
        ).fetchall()
        kw["comment_template_ids"] = [r["comment_template_id"] for r in mapped_comments]
    conn.close()
    return keywords


def delete_keyword(keyword_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM keywords WHERE id = ?", (keyword_id,))
    conn.commit()
    conn.close()


def get_keyword_boards(keyword_id: int):
    """키워드에 매핑된 게시판 ID 목록 반환"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT board_id FROM keyword_board_mapping WHERE keyword_id = ?",
        (keyword_id,)
    ).fetchall()
    conn.close()
    return [r["board_id"] for r in rows]


def set_keyword_boards(keyword_id: int, board_ids: list):
    """키워드-게시판 매핑 설정 (기존 매핑 교체)"""
    conn = get_connection()
    conn.execute("DELETE FROM keyword_board_mapping WHERE keyword_id = ?", (keyword_id,))
    for bid in board_ids:
        conn.execute(
            "INSERT INTO keyword_board_mapping (keyword_id, board_id) VALUES (?, ?)",
            (keyword_id, bid)
        )
    conn.commit()
    conn.close()


def get_boards_for_keyword(keyword_id: int):
    """키워드에 매핑된 게시판 상세 정보 반환. 매핑 없으면 전체 활성 게시판."""
    conn = get_connection()
    mapped = conn.execute(
        """SELECT cb.* FROM cafe_boards cb
           JOIN keyword_board_mapping kbm ON cb.id = kbm.board_id
           WHERE kbm.keyword_id = ? AND cb.active = 1""",
        (keyword_id,)
    ).fetchall()

    if mapped:
        conn.close()
        return [dict(r) for r in mapped]

    # 매핑 없으면 전체 활성 게시판 (하위 호환)
    rows = conn.execute("SELECT * FROM cafe_boards WHERE active = 1").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def increment_keyword_usage(keyword_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE keywords SET used_count = used_count + 1, last_used_at = ? WHERE id = ?",
        (datetime.now().isoformat(), keyword_id)
    )
    conn.commit()
    conn.close()


# ─── Keyword-Comment Mapping ──────────────────────────────

def get_keyword_comments(keyword_id: int):
    """키워드에 매핑된 댓글 템플릿 ID 목록 반환"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT comment_template_id FROM keyword_comment_mapping WHERE keyword_id = ?",
        (keyword_id,)
    ).fetchall()
    conn.close()
    return [r["comment_template_id"] for r in rows]


def set_keyword_comments(keyword_id: int, template_ids: list):
    """키워드-댓글 템플릿 매핑 설정 (기존 매핑 교체)"""
    conn = get_connection()
    conn.execute("DELETE FROM keyword_comment_mapping WHERE keyword_id = ?", (keyword_id,))
    for tid in template_ids:
        conn.execute(
            "INSERT INTO keyword_comment_mapping (keyword_id, comment_template_id) VALUES (?, ?)",
            (keyword_id, tid)
        )
    conn.commit()
    conn.close()


def get_comments_for_keyword(keyword_id: int):
    """키워드에 매핑된 활성 댓글 템플릿 반환. 매핑 없으면 전체 활성 템플릿."""
    conn = get_connection()
    mapped = conn.execute(
        """SELECT ct.* FROM comment_templates ct
           JOIN keyword_comment_mapping kcm ON ct.id = kcm.comment_template_id
           WHERE kcm.keyword_id = ? AND ct.active = 1""",
        (keyword_id,)
    ).fetchall()

    if mapped:
        conn.close()
        return [dict(r) for r in mapped]

    # 매핑 없으면 전체 활성 템플릿 (하위 호환)
    rows = conn.execute("SELECT * FROM comment_templates WHERE active = 1").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Comment Templates CRUD ────────────────────────────────

def add_comment_template(text: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO comment_templates (text) VALUES (?)", (text,))
    conn.commit()
    cid = cursor.lastrowid
    conn.close()
    return cid


def get_comment_templates():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM comment_templates ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def toggle_comment_template(template_id: int):
    conn = get_connection()
    conn.execute("UPDATE comment_templates SET active = 1 - active WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()


def delete_comment_template(template_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM comment_templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()


# ─── Publish History ───────────────────────────────────────

def add_publish_record(keyword_id, board_id, account_id, title, content) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO publish_history (keyword_id, board_id, account_id, title, content, status)
           VALUES (?, ?, ?, ?, ?, 'pending')""",
        (keyword_id, board_id, account_id, title, content)
    )
    conn.commit()
    pid = cursor.lastrowid
    conn.close()
    return pid


def update_publish_status(publish_id: int, status: str, published_url: str = None, error_message: str = None):
    conn = get_connection()
    conn.execute(
        "UPDATE publish_history SET status = ?, published_url = ?, error_message = ? WHERE id = ?",
        (status, published_url, error_message, publish_id)
    )
    conn.commit()
    conn.close()


def get_publish_history(limit: int = 50):
    conn = get_connection()
    rows = conn.execute(
        """SELECT ph.*, k.text as keyword_text, cb.board_name, cb.cafe_url, a.username as account_username
           FROM publish_history ph
           LEFT JOIN keywords k ON ph.keyword_id = k.id
           LEFT JOIN cafe_boards cb ON ph.board_id = cb.id
           LEFT JOIN accounts a ON ph.account_id = a.id
           ORDER BY ph.created_at DESC LIMIT ?""",
        (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Comment History ───────────────────────────────────────

def add_comment_record(publish_id: int, account_id: int, template_id: int = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO comment_history (publish_id, account_id, template_id) VALUES (?, ?, ?)",
        (publish_id, account_id, template_id)
    )
    conn.commit()
    cid = cursor.lastrowid
    conn.close()
    return cid


def update_comment_status(comment_id: int, status: str, error_message: str = None):
    conn = get_connection()
    conn.execute(
        "UPDATE comment_history SET status = ?, error_message = ? WHERE id = ?",
        (status, error_message, comment_id)
    )
    conn.commit()
    conn.close()


def get_comments_for_publish(publish_id: int):
    conn = get_connection()
    rows = conn.execute(
        """SELECT ch.*, a.username as account_username
           FROM comment_history ch
           JOIN accounts a ON ch.account_id = a.id
           WHERE ch.publish_id = ?
           ORDER BY ch.created_at""",
        (publish_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Schedule Config ───────────────────────────────────────

def get_schedule_config():
    conn = get_connection()
    row = conn.execute("SELECT * FROM schedule_config WHERE id = 1").fetchone()
    conn.close()
    return dict(row) if row else {}


def update_schedule_config(**kwargs):
    conn = get_connection()
    allowed = [
        "days", "times", "interval_min", "random_delay_min", "random_delay_max",
        "comment_enabled", "comments_per_post", "comment_delay_min", "comment_delay_max",
        "comment_order", "exclude_author", "cross_publish", "account_interval_hours",
        "max_accounts_per_run", "base_start_hour", "base_start_minute", "daily_shift_minutes"
    ]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        conn.close()
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(f"UPDATE schedule_config SET {set_clause} WHERE id = 1", list(updates.values()))
    conn.commit()
    conn.close()
