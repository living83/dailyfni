"""
database.py - SQLite 데이터베이스 관리
계정, 카페, 게시판, 키워드, 발행 이력 테이블
"""

import sqlite3
import os
from datetime import datetime
from pathlib import Path

from seed_data import seed as seed_db, reseed as reseed_db

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "cafe_macro.db"


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30)  # 락 충돌 시 최대 30초 대기
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")  # 30초 busy timeout (ms 단위)
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

        CREATE TABLE IF NOT EXISTS cafes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cafe_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT '',
            active INTEGER DEFAULT 1,
            interval_min INTEGER DEFAULT 3,
            interval_max INTEGER DEFAULT 15,
            daily_post_limit INTEGER DEFAULT 3,
            daily_comment_limit INTEGER DEFAULT 10,
            comments_per_post INTEGER DEFAULT 6,
            comment_delay_min INTEGER DEFAULT 60,
            comment_delay_max INTEGER DEFAULT 300,
            comment_order TEXT DEFAULT 'random',
            exclude_author INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS cafe_boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cafe_url TEXT NOT NULL,
            board_name TEXT NOT NULL,
            menu_id TEXT NOT NULL DEFAULT '',
            cafe_group_id INTEGER,
            active INTEGER DEFAULT 1,
            last_published_at TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (cafe_group_id) REFERENCES cafes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
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

        CREATE TABLE IF NOT EXISTS cafe_account_mapping (
            cafe_group_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (cafe_group_id, account_id),
            FOREIGN KEY (cafe_group_id) REFERENCES cafes(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
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

        CREATE TABLE IF NOT EXISTS telegram_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            bot_token TEXT DEFAULT '',
            chat_id TEXT DEFAULT '',
            enabled INTEGER DEFAULT 0,
            notify_success INTEGER DEFAULT 1,
            notify_failure INTEGER DEFAULT 1,
            notify_batch_summary INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS schedule_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            days TEXT DEFAULT '1,1,1,1,1,0,0',
            times TEXT DEFAULT '08:00',
            interval_min INTEGER DEFAULT 3,
            interval_max INTEGER DEFAULT 15,
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
            max_parallel_accounts INTEGER DEFAULT 3,
            base_start_hour INTEGER DEFAULT 8,
            base_start_minute INTEGER DEFAULT 0,
            daily_shift_minutes INTEGER DEFAULT 30,
            daily_post_limit INTEGER DEFAULT 3,
            daily_comment_limit INTEGER DEFAULT 10,
            footer_link TEXT DEFAULT 'http://pf.kakao.com/_XEUIX/chat',
            footer_link_text TEXT DEFAULT '카카오톡 상담하기'
        );

        CREATE TABLE IF NOT EXISTS api_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            api_key TEXT DEFAULT '',
            captcha_auto_solve INTEGER DEFAULT 1
        );
    """)

    # ── accounts에 proxy 컬럼 추가 (없을 때만) ──
    for proxy_col in ["proxy_server", "proxy_username", "proxy_password"]:
        try:
            cursor.execute(f"ALTER TABLE accounts ADD COLUMN {proxy_col} TEXT DEFAULT NULL")
        except sqlite3.OperationalError:
            pass  # 이미 존재

    # 기존 DB 마이그레이션: 새 컬럼 추가
    for tbl, col, default in [
        ("schedule_config", "max_accounts_per_run", "30"),
        ("schedule_config", "max_parallel_accounts", "3"),
        ("schedule_config", "base_start_hour", "8"),
        ("schedule_config", "base_start_minute", "0"),
        ("schedule_config", "daily_shift_minutes", "30"),
        ("schedule_config", "interval_max", "15"),
        ("schedule_config", "daily_post_limit", "3"),
        ("schedule_config", "daily_comment_limit", "10"),
        ("cafe_boards", "cafe_group_id", "NULL"),
        ("cafes", "default_board_id", "NULL"),        # 기본 게시판 ID
        ("keywords", "description", "TEXT_EMPTY"),    # 키워드 특징/맥락 필드

        ("schedule_config", "footer_link", "TEXT_DEFAULT"),
        ("schedule_config", "footer_link_text", "TEXT_DEFAULT_LINK_TEXT"),
    ]:
        try:
            if default == "TEXT_DEFAULT":
                cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} TEXT DEFAULT 'http://pf.kakao.com/_XEUIX/chat'")
            elif default == "TEXT_DEFAULT_LINK_TEXT":
                cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} TEXT DEFAULT '카카오톡 상담하기'")
            elif default == "TEXT_EMPTY":
                cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} TEXT DEFAULT ''")
            elif default == "TEXT_NULL":
                cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} TEXT")
            elif default == "NULL":
                cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} INTEGER")
            else:
                cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} INTEGER DEFAULT {default}")
        except sqlite3.OperationalError:
            pass  # 이미 존재


    # 기존 설정값을 새 기본값으로 업데이트 (이전 기본값인 경우에만)
    cursor.execute("UPDATE schedule_config SET interval_min = 5 WHERE id = 1 AND interval_min = 30")
    cursor.execute("UPDATE schedule_config SET times = '08:00' WHERE id = 1 AND times = '09:00,14:00,19:00'")

    # 기본 스케줄 설정 삽입
    cursor.execute("""
        INSERT OR IGNORE INTO schedule_config (id) VALUES (1)
    """)

    # 기본 텔레그램 설정 삽입
    cursor.execute("""
        INSERT OR IGNORE INTO telegram_config (id) VALUES (1)
    """)

    # 기본 API 설정 삽입
    cursor.execute("""
        INSERT OR IGNORE INTO api_config (id) VALUES (1)
    """)

    conn.commit()

    # ── 마이그레이션: 기존 cafe_boards → cafes 테이블 자동 생성 ──
    _migrate_boards_to_cafes(conn)

    # 시드 데이터 삽입 (키워드·댓글 비어 있을 때만)
    seed_db(conn)

    conn.close()


def _migrate_boards_to_cafes(conn):
    """기존 cafe_boards에서 cafe_group_id가 없는 보드를 cafes 그룹으로 자동 마이그레이션"""
    cursor = conn.cursor()
    orphans = cursor.execute(
        "SELECT DISTINCT cafe_url FROM cafe_boards WHERE cafe_group_id IS NULL"
    ).fetchall()

    if not orphans:
        return

    for row in orphans:
        cafe_url = row["cafe_url"]
        # cafes에 이미 있으면 사용, 없으면 생성
        existing = cursor.execute(
            "SELECT id FROM cafes WHERE cafe_id = ?", (cafe_url,)
        ).fetchone()

        if existing:
            cafe_group_id = existing["id"]
        else:
            cursor.execute(
                "INSERT INTO cafes (cafe_id, name) VALUES (?, ?)",
                (cafe_url, cafe_url)
            )
            cafe_group_id = cursor.lastrowid

        cursor.execute(
            "UPDATE cafe_boards SET cafe_group_id = ? WHERE cafe_url = ? AND cafe_group_id IS NULL",
            (cafe_group_id, cafe_url)
        )

    conn.commit()


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
    conn.execute("DELETE FROM cafe_account_mapping WHERE account_id = ?", (account_id,))
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



def update_account_proxy(account_id: int, server: str, username: str = "", password: str = ""):
    """프록시 정보를 AES-256 암호화하여 저장"""
    from crypto import encrypt_password
    enc_server = encrypt_password(server) if server else None
    enc_username = encrypt_password(username) if username else None
    enc_password = encrypt_password(password) if password else None
    conn = get_connection()
    conn.execute(
        "UPDATE accounts SET proxy_server = ?, proxy_username = ?, proxy_password = ? WHERE id = ?",
        (enc_server, enc_username, enc_password, account_id),
    )
    conn.commit()
    conn.close()


def delete_account_proxy(account_id: int):
    """프록시 정보 제거"""
    conn = get_connection()
    conn.execute(
        "UPDATE accounts SET proxy_server = NULL, proxy_username = NULL, proxy_password = NULL WHERE id = ?",
        (account_id,),
    )
    conn.commit()
    conn.close()


def get_account_proxy(account_id: int) -> dict | None:
    """복호화된 프록시 정보 반환. 없거나 복호화 실패 시 None."""
    from crypto import decrypt_password
    conn = get_connection()
    row = conn.execute(
        "SELECT proxy_server, proxy_username, proxy_password FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    conn.close()
    if not row or not row["proxy_server"]:
        return None
    try:
        server = decrypt_password(row["proxy_server"])
    except Exception:
        server = row["proxy_server"]
    try:
        username = decrypt_password(row["proxy_username"]) if row["proxy_username"] else ""
    except Exception:
        username = row["proxy_username"] or ""
    try:
        password = decrypt_password(row["proxy_password"]) if row["proxy_password"] else ""
    except Exception:
        password = row["proxy_password"] or ""
    return {"server": server, "username": username, "password": password}


def update_account_last_published(account_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE accounts SET last_published_at = ? WHERE id = ?",
        (datetime.now().isoformat(), account_id)
    )
    conn.commit()
    conn.close()


# ─── Cafes CRUD ──────────────────────────────────────────

def add_cafe(cafe_id: str, name: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO cafes (cafe_id, name) VALUES (?, ?)",
        (cafe_id, name or cafe_id)
    )
    conn.commit()
    cid = cursor.lastrowid
    conn.close()
    return cid


def get_cafes():
    """모든 카페 + 소속 게시판 + 지정 계정 ID 목록 반환"""
    conn = get_connection()
    cafes = [dict(r) for r in conn.execute("SELECT * FROM cafes ORDER BY id").fetchall()]
    for cafe in cafes:
        boards = conn.execute(
            "SELECT * FROM cafe_boards WHERE cafe_group_id = ? ORDER BY id",
            (cafe["id"],)
        ).fetchall()
        cafe["boards"] = [dict(b) for b in boards]
        assigned = conn.execute(
            "SELECT account_id FROM cafe_account_mapping WHERE cafe_group_id = ?",
            (cafe["id"],)
        ).fetchall()
        cafe["account_ids"] = [r["account_id"] for r in assigned]
    conn.close()
    return cafes


def get_cafe(cafe_id: int) -> dict:
    conn = get_connection()
    row = conn.execute("SELECT * FROM cafes WHERE id = ?", (cafe_id,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def update_cafe_settings(cafe_id: int, **kwargs):
    conn = get_connection()
    allowed = [
        "name", "active", "interval_min", "interval_max",
        "daily_post_limit", "daily_comment_limit",
        "comments_per_post", "comment_delay_min", "comment_delay_max",
        "comment_order", "exclude_author"
    ]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        conn.close()
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(f"UPDATE cafes SET {set_clause} WHERE id = ?",
                 list(updates.values()) + [cafe_id])
    conn.commit()
    conn.close()


def delete_cafe(cafe_id: int):
    conn = get_connection()
    # 소속 게시판도 삭제 (ON DELETE CASCADE)
    conn.execute("DELETE FROM cafes WHERE id = ?", (cafe_id,))
    conn.commit()
    conn.close()


# ─── Cafe-Account Mapping ────────────────────────────────

def get_cafe_accounts(cafe_group_id: int) -> list[int]:
    """카페에 지정된 계정 ID 목록 반환"""
    conn = get_connection()
    rows = conn.execute(
        "SELECT account_id FROM cafe_account_mapping WHERE cafe_group_id = ?",
        (cafe_group_id,)
    ).fetchall()
    conn.close()
    return [r["account_id"] for r in rows]


def set_cafe_accounts(cafe_group_id: int, account_ids: list[int]):
    """카페-계정 매핑 설정 (기존 매핑 교체)"""
    conn = get_connection()
    conn.execute("DELETE FROM cafe_account_mapping WHERE cafe_group_id = ?", (cafe_group_id,))
    for aid in account_ids:
        conn.execute(
            "INSERT INTO cafe_account_mapping (cafe_group_id, account_id) VALUES (?, ?)",
            (cafe_group_id, aid)
        )
    conn.commit()
    conn.close()


# ─── Cafe Boards CRUD ─────────────────────────────────────

def add_cafe_board(cafe_url: str, board_name: str, menu_id: str = "", cafe_group_id: int = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO cafe_boards (cafe_url, board_name, menu_id, cafe_group_id) VALUES (?, ?, ?, ?)",
        (cafe_url, board_name, menu_id, cafe_group_id)
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


def get_boards_by_cafe(cafe_group_id: int):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM cafe_boards WHERE cafe_group_id = ? ORDER BY id",
        (cafe_group_id,)
    ).fetchall()
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

def add_keyword(text: str, description: str = "") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO keywords (text, description) VALUES (?, ?)",
        (text, description.strip())
    )
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
    try:
        conn.execute("DELETE FROM keyword_comment_mapping WHERE keyword_id = ?", (keyword_id,))
        conn.execute("DELETE FROM keyword_board_mapping WHERE keyword_id = ?", (keyword_id,))
        # 참조 무결성 오류를 피하기 위해 남은 히스토리 기록의 외래키를 해제합니다.
        conn.execute("UPDATE publish_history SET keyword_id = NULL WHERE keyword_id = ?", (keyword_id,))
        conn.execute("DELETE FROM keywords WHERE id = ?", (keyword_id,))
        conn.commit()
    except sqlite3.IntegrityError:
        # 삭제가 차단되는 경우
        conn.rollback()
        raise
    finally:
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


def get_today_post_count(account_id: int, cafe_group_id: int = None) -> int:
    """오늘 해당 계정의 게시 횟수 반환 (카페별 필터 가능)"""
    conn = get_connection()
    today = datetime.now().strftime("%Y-%m-%d")
    if cafe_group_id is not None:
        row = conn.execute(
            """SELECT COUNT(*) as cnt FROM publish_history ph
               JOIN cafe_boards cb ON ph.board_id = cb.id
               WHERE ph.account_id = ? AND ph.status = '성공'
               AND ph.created_at LIKE ? AND cb.cafe_group_id = ?""",
            (account_id, f"{today}%", cafe_group_id)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM publish_history WHERE account_id = ? AND status = '성공' AND created_at LIKE ?",
            (account_id, f"{today}%")
        ).fetchone()
    conn.close()
    return row["cnt"] if row else 0


def get_account_last_published_at(account_id: int, cafe_group_id: int = None) -> str | None:
    """계정의 마지막 발행 시간 반환 (카페별 필터 가능)"""
    conn = get_connection()
    if cafe_group_id is not None:
        row = conn.execute(
            """SELECT MAX(ph.created_at) as last_pub FROM publish_history ph
               JOIN cafe_boards cb ON ph.board_id = cb.id
               WHERE ph.account_id = ? AND ph.status = '성공'
               AND cb.cafe_group_id = ?""",
            (account_id, cafe_group_id)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT MAX(created_at) as last_pub FROM publish_history WHERE account_id = ? AND status = '성공'",
            (account_id,)
        ).fetchone()
    conn.close()
    return row["last_pub"] if row and row["last_pub"] else None


def get_today_comment_count(account_id: int, cafe_group_id: int = None) -> int:
    """오늘 해당 계정의 댓글 횟수 반환 (카페별 필터 가능)"""
    conn = get_connection()
    today = datetime.now().strftime("%Y-%m-%d")
    if cafe_group_id is not None:
        row = conn.execute(
            """SELECT COUNT(*) as cnt FROM comment_history ch
               JOIN publish_history ph ON ch.publish_id = ph.id
               JOIN cafe_boards cb ON ph.board_id = cb.id
               WHERE ch.account_id = ? AND ch.status = '성공'
               AND ch.created_at LIKE ? AND cb.cafe_group_id = ?""",
            (account_id, f"{today}%", cafe_group_id)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM comment_history WHERE account_id = ? AND status = '성공' AND created_at LIKE ?",
            (account_id, f"{today}%")
        ).fetchone()
    conn.close()
    return row["cnt"] if row else 0


def update_schedule_config(**kwargs):
    conn = get_connection()
    allowed = [
        "days", "times", "interval_min", "interval_max",
        "random_delay_min", "random_delay_max",
        "comment_enabled", "comments_per_post", "comment_delay_min", "comment_delay_max",
        "comment_order", "exclude_author", "cross_publish", "account_interval_hours",
        "max_accounts_per_run", "max_parallel_accounts",
        "base_start_hour", "base_start_minute", "daily_shift_minutes",
        "daily_post_limit", "daily_comment_limit", "footer_link", "footer_link_text"
    ]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        conn.close()
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(f"UPDATE schedule_config SET {set_clause} WHERE id = 1", list(updates.values()))
    conn.commit()
    conn.close()
