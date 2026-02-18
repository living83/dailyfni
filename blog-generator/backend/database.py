"""
SQLite 데이터베이스 설정 및 CRUD 유틸리티
"""

import os
import json
import aiosqlite
from pathlib import Path
from datetime import datetime, timedelta

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "dailyfni.db"
COOKIE_DIR = DATA_DIR / "cookies"


async def init_db():
    """데이터베이스 초기화 및 테이블 생성"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    COOKIE_DIR.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_name TEXT NOT NULL,
                naver_id TEXT NOT NULL,
                naver_password TEXT NOT NULL,
                cookie_file_path TEXT DEFAULT '',
                default_category_id INTEGER DEFAULT NULL,
                specialty TEXT DEFAULT '',
                last_used TEXT DEFAULT '',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                category_name TEXT NOT NULL,
                is_default INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS publish_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                scheduled_start_time TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                total_count INTEGER DEFAULT 3,
                success_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS publish_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id INTEGER,
                document_number INTEGER DEFAULT 1,
                account_id INTEGER,
                category_id INTEGER,
                title TEXT DEFAULT '',
                content TEXT DEFAULT '',
                keywords TEXT DEFAULT '[]',
                published_at TEXT DEFAULT '',
                scheduled_time TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                error_message TEXT DEFAULT '',
                naver_post_url TEXT DEFAULT '',
                document_format TEXT DEFAULT 'tutorial',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (batch_id) REFERENCES publish_batches(id) ON DELETE CASCADE,
                FOREIGN KEY (account_id) REFERENCES accounts(id),
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );

            CREATE TABLE IF NOT EXISTS keyword_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL,
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'pending',
                last_used_at TEXT DEFAULT '',
                next_available_at TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                used_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS keyword_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL,
                account_id INTEGER,
                used_count INTEGER DEFAULT 0,
                last_used_at TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT DEFAULT 'info',
                title TEXT NOT NULL,
                message TEXT DEFAULT '',
                is_read INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS scheduler_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                is_active INTEGER DEFAULT 0,
                start_hour INTEGER DEFAULT 8,
                start_minute INTEGER DEFAULT 0,
                end_hour INTEGER DEFAULT 10,
                end_minute INTEGER DEFAULT 0,
                days_of_week TEXT DEFAULT '[1,2,3,4,5]',
                min_interval_hours INTEGER DEFAULT 2,
                max_interval_hours INTEGER DEFAULT 4,
                random_rest_enabled INTEGER DEFAULT 1,
                random_rest_percent INTEGER DEFAULT 20,
                weekend_low_prob INTEGER DEFAULT 1,
                weekend_prob_percent INTEGER DEFAULT 30,
                force_rest_after_days INTEGER DEFAULT 3,
                consecutive_publish_days INTEGER DEFAULT 0,
                last_publish_date TEXT DEFAULT '',
                updated_at TEXT DEFAULT (datetime('now', 'localtime'))
            );

            -- 기본 스케줄러 설정 삽입 (없을 때만)
            INSERT OR IGNORE INTO scheduler_config (id) VALUES (1);
        """)
        await db.commit()


def _row_to_dict(cursor, row):
    """sqlite row를 dict로 변환"""
    if row is None:
        return None
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


async def get_db():
    """DB 연결 반환"""
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    return db


# ─── 계정 CRUD ──────────────────────────────────────────

async def create_account(data: dict) -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """INSERT INTO accounts (account_name, naver_id, naver_password, specialty)
               VALUES (?, ?, ?, ?)""",
            (data["account_name"], data["naver_id"], data["naver_password"], data.get("specialty", "")),
        )
        await db.commit()
        account_id = cursor.lastrowid
        row = await db.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        result = await row.fetchone()
        return dict(result)


async def get_accounts() -> list:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM accounts ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


async def get_account(account_id: int) -> dict | None:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def update_account(account_id: int, data: dict) -> dict | None:
    fields = []
    values = []
    for key in ["account_name", "naver_id", "naver_password", "specialty", "is_active", "default_category_id", "cookie_file_path", "last_used"]:
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    if not fields:
        return await get_account(account_id)
    values.append(account_id)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(f"UPDATE accounts SET {', '.join(fields)} WHERE id = ?", values)
        await db.commit()
    return await get_account(account_id)


async def delete_account(account_id: int) -> bool:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        await db.commit()
        return cursor.rowcount > 0


# ─── 카테고리 CRUD ──────────────────────────────────────

async def create_category(data: dict) -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        if data.get("is_default"):
            await db.execute("UPDATE categories SET is_default = 0 WHERE account_id = ?", (data["account_id"],))
        cursor = await db.execute(
            "INSERT INTO categories (account_id, category_name, is_default) VALUES (?, ?, ?)",
            (data["account_id"], data["category_name"], 1 if data.get("is_default") else 0),
        )
        await db.commit()
        row = await db.execute("SELECT * FROM categories WHERE id = ?", (cursor.lastrowid,))
        return dict(await row.fetchone())


async def get_categories(account_id: int) -> list:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM categories WHERE account_id = ? ORDER BY is_default DESC, category_name", (account_id,))
        return [dict(r) for r in await cursor.fetchall()]


async def update_category(cat_id: int, data: dict) -> dict | None:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        if data.get("is_default"):
            row = await db.execute("SELECT account_id FROM categories WHERE id = ?", (cat_id,))
            cat = await row.fetchone()
            if cat:
                await db.execute("UPDATE categories SET is_default = 0 WHERE account_id = ?", (cat["account_id"],))
        fields = []
        values = []
        for key in ["category_name", "is_default"]:
            if key in data:
                fields.append(f"{key} = ?")
                values.append(data[key])
        if fields:
            values.append(cat_id)
            await db.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", values)
            await db.commit()
        row = await db.execute("SELECT * FROM categories WHERE id = ?", (cat_id,))
        result = await row.fetchone()
        return dict(result) if result else None


async def delete_category(cat_id: int) -> bool:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
        await db.commit()
        return cursor.rowcount > 0


# ─── 발행 배치 CRUD ──────────────────────────────────────

async def create_batch(keyword: str, scheduled_start_time: str = "") -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "INSERT INTO publish_batches (keyword, scheduled_start_time) VALUES (?, ?)",
            (keyword, scheduled_start_time),
        )
        await db.commit()
        row = await db.execute("SELECT * FROM publish_batches WHERE id = ?", (cursor.lastrowid,))
        return dict(await row.fetchone())


async def get_batches(limit: int = 50, offset: int = 0) -> list:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM publish_batches ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_batch(batch_id: int) -> dict | None:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        row = await db.execute("SELECT * FROM publish_batches WHERE id = ?", (batch_id,))
        result = await row.fetchone()
        return dict(result) if result else None


async def update_batch(batch_id: int, data: dict):
    fields = []
    values = []
    for key in ["status", "success_count", "failed_count", "scheduled_start_time"]:
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    if fields:
        values.append(batch_id)
        async with aiosqlite.connect(str(DB_PATH)) as db:
            await db.execute(f"UPDATE publish_batches SET {', '.join(fields)} WHERE id = ?", values)
            await db.commit()


# ─── 발행 이력 CRUD ──────────────────────────────────────

async def create_publish_history(data: dict) -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """INSERT INTO publish_history
               (batch_id, document_number, account_id, category_id, title, content, keywords, scheduled_time, document_format)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["batch_id"], data.get("document_number", 1),
                data.get("account_id"), data.get("category_id"),
                data.get("title", ""), data.get("content", ""),
                json.dumps(data.get("keywords", []), ensure_ascii=False),
                data.get("scheduled_time", ""),
                data.get("document_format", "tutorial"),
            ),
        )
        await db.commit()
        row = await db.execute("SELECT * FROM publish_history WHERE id = ?", (cursor.lastrowid,))
        return dict(await row.fetchone())


async def update_publish_history(history_id: int, data: dict):
    fields = []
    values = []
    for key in ["status", "error_message", "naver_post_url", "published_at"]:
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    if fields:
        values.append(history_id)
        async with aiosqlite.connect(str(DB_PATH)) as db:
            await db.execute(f"UPDATE publish_history SET {', '.join(fields)} WHERE id = ?", values)
            await db.commit()


async def get_publish_history(filters: dict = None) -> list:
    filters = filters or {}
    query = "SELECT ph.*, a.account_name, c.category_name FROM publish_history ph LEFT JOIN accounts a ON ph.account_id = a.id LEFT JOIN categories c ON ph.category_id = c.id WHERE 1=1"
    params = []

    if filters.get("account_id"):
        query += " AND ph.account_id = ?"
        params.append(filters["account_id"])
    if filters.get("batch_id"):
        query += " AND ph.batch_id = ?"
        params.append(filters["batch_id"])
    if filters.get("status"):
        query += " AND ph.status = ?"
        params.append(filters["status"])
    if filters.get("keyword"):
        query += " AND (ph.title LIKE ? OR ph.keywords LIKE ?)"
        kw = f"%{filters['keyword']}%"
        params.extend([kw, kw])
    if filters.get("date_from"):
        query += " AND ph.created_at >= ?"
        params.append(filters["date_from"])
    if filters.get("date_to"):
        query += " AND ph.created_at <= ?"
        params.append(filters["date_to"])

    query += " ORDER BY ph.created_at DESC"
    limit = filters.get("limit", 100)
    offset = filters.get("offset", 0)
    query += " LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        return [dict(r) for r in await cursor.fetchall()]


async def get_batch_history(batch_id: int) -> list:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT ph.*, a.account_name, c.category_name
               FROM publish_history ph
               LEFT JOIN accounts a ON ph.account_id = a.id
               LEFT JOIN categories c ON ph.category_id = c.id
               WHERE ph.batch_id = ? ORDER BY ph.document_number""",
            (batch_id,),
        )
        return [dict(r) for r in await cursor.fetchall()]


# ─── 키워드 큐 CRUD ──────────────────────────────────────

async def add_keyword(data: dict) -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "INSERT INTO keyword_queue (keyword, priority) VALUES (?, ?)",
            (data["keyword"], data.get("priority", "medium")),
        )
        await db.commit()
        row = await db.execute("SELECT * FROM keyword_queue WHERE id = ?", (cursor.lastrowid,))
        return dict(await row.fetchone())


async def add_keywords_bulk(keywords: list) -> int:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        count = 0
        for kw in keywords:
            keyword = kw if isinstance(kw, str) else kw.get("keyword", "")
            priority = "medium" if isinstance(kw, str) else kw.get("priority", "medium")
            if keyword.strip():
                await db.execute(
                    "INSERT INTO keyword_queue (keyword, priority) VALUES (?, ?)",
                    (keyword.strip(), priority),
                )
                count += 1
        await db.commit()
        return count


async def get_keywords(status: str = None) -> list:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        query = "SELECT * FROM keyword_queue"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at ASC"
        cursor = await db.execute(query, params)
        return [dict(r) for r in await cursor.fetchall()]


async def get_next_keyword() -> dict | None:
    now = datetime.now().isoformat()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT * FROM keyword_queue
               WHERE status = 'pending'
               AND (next_available_at = '' OR next_available_at <= ?)
               ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
                        created_at ASC
               LIMIT 1""",
            (now,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def update_keyword(kw_id: int, data: dict):
    fields = []
    values = []
    for key in ["keyword", "priority", "status", "last_used_at", "next_available_at", "used_count"]:
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    if fields:
        values.append(kw_id)
        async with aiosqlite.connect(str(DB_PATH)) as db:
            await db.execute(f"UPDATE keyword_queue SET {', '.join(fields)} WHERE id = ?", values)
            await db.commit()


async def delete_keyword(kw_id: int) -> bool:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute("DELETE FROM keyword_queue WHERE id = ?", (kw_id,))
        await db.commit()
        return cursor.rowcount > 0


# ─── 키워드 통계 ──────────────────────────────────────

async def update_keyword_stats(keyword: str, account_id: int):
    now = datetime.now().isoformat()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        row = await db.execute(
            "SELECT id FROM keyword_stats WHERE keyword = ? AND account_id = ?",
            (keyword, account_id),
        )
        existing = await row.fetchone()
        if existing:
            await db.execute(
                "UPDATE keyword_stats SET used_count = used_count + 1, last_used_at = ? WHERE keyword = ? AND account_id = ?",
                (now, keyword, account_id),
            )
        else:
            await db.execute(
                "INSERT INTO keyword_stats (keyword, account_id, used_count, last_used_at) VALUES (?, ?, 1, ?)",
                (keyword, account_id, now),
            )
        await db.commit()


async def get_keyword_stats_top(limit: int = 10) -> list:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT keyword, SUM(used_count) as total_count, MAX(last_used_at) as last_used
               FROM keyword_stats GROUP BY keyword ORDER BY total_count DESC LIMIT ?""",
            (limit,),
        )
        return [dict(r) for r in await cursor.fetchall()]


async def get_dashboard_stats() -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row

        # 총 발행 수
        row = await db.execute("SELECT COUNT(*) as cnt FROM publish_history WHERE status = 'success'")
        total_success = (await row.fetchone())["cnt"]

        row = await db.execute("SELECT COUNT(*) as cnt FROM publish_history WHERE status = 'failed'")
        total_failed = (await row.fetchone())["cnt"]

        # 계정별 발행 현황
        cursor = await db.execute(
            """SELECT a.account_name, COUNT(ph.id) as count
               FROM publish_history ph JOIN accounts a ON ph.account_id = a.id
               WHERE ph.status = 'success'
               GROUP BY ph.account_id ORDER BY count DESC"""
        )
        by_account = [dict(r) for r in await cursor.fetchall()]

        # 최근 7일 발행 추이
        cursor = await db.execute(
            """SELECT DATE(published_at) as date, COUNT(*) as count
               FROM publish_history WHERE status = 'success'
               AND published_at >= datetime('now', '-7 days')
               GROUP BY DATE(published_at) ORDER BY date"""
        )
        daily_trend = [dict(r) for r in await cursor.fetchall()]

        # 키워드 큐 현황
        row = await db.execute("SELECT COUNT(*) as cnt FROM keyword_queue WHERE status = 'pending'")
        pending_keywords = (await row.fetchone())["cnt"]

        row = await db.execute("SELECT COUNT(*) as cnt FROM keyword_queue WHERE status = 'used'")
        used_keywords = (await row.fetchone())["cnt"]

        return {
            "total_success": total_success,
            "total_failed": total_failed,
            "by_account": by_account,
            "daily_trend": daily_trend,
            "pending_keywords": pending_keywords,
            "used_keywords": used_keywords,
        }


# ─── 알림 CRUD ──────────────────────────────────────

async def create_notification(ntype: str, title: str, message: str = "") -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)",
            (ntype, title, message),
        )
        await db.commit()
        row = await db.execute("SELECT * FROM notifications WHERE id = ?", (cursor.lastrowid,))
        return dict(await row.fetchone())


async def get_notifications(unread_only: bool = False) -> list:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        query = "SELECT * FROM notifications"
        if unread_only:
            query += " WHERE is_read = 0"
        query += " ORDER BY created_at DESC LIMIT 100"
        cursor = await db.execute(query)
        return [dict(r) for r in await cursor.fetchall()]


async def mark_notification_read(nid: int):
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (nid,))
        await db.commit()


async def delete_notification(nid: int) -> bool:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute("DELETE FROM notifications WHERE id = ?", (nid,))
        await db.commit()
        return cursor.rowcount > 0


# ─── 스케줄러 설정 ──────────────────────────────────────

async def get_scheduler_config() -> dict:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM scheduler_config WHERE id = 1")
        row = await cursor.fetchone()
        if row:
            d = dict(row)
            d["days_of_week"] = json.loads(d["days_of_week"])
            return d
        return {}


async def update_scheduler_config(data: dict):
    fields = []
    values = []
    for key, val in data.items():
        if key in ("id",):
            continue
        if key == "days_of_week" and isinstance(val, list):
            val = json.dumps(val)
        fields.append(f"{key} = ?")
        values.append(val)
    if fields:
        fields.append("updated_at = datetime('now', 'localtime')")
        values.append(1)
        async with aiosqlite.connect(str(DB_PATH)) as db:
            await db.execute(f"UPDATE scheduler_config SET {', '.join(fields)} WHERE id = ?", values)
            await db.commit()


# ─── 중복 키워드 체크 ──────────────────────────────────

async def check_keyword_duplicate(keyword: str, days: int = 7) -> bool:
    """최근 N일 내에 같은 키워드가 사용되었는지 확인"""
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute(
            """SELECT COUNT(*) as cnt FROM publish_batches
               WHERE keyword = ? AND created_at >= datetime('now', ? || ' days')""",
            (keyword, f"-{days}"),
        )
        row = await cursor.fetchone()
        return row[0] > 0


# ─── CSV 내보내기 데이터 ──────────────────────────────────

async def get_export_data(filters: dict = None) -> list:
    """발행 이력을 CSV 내보내기용으로 조회"""
    return await get_publish_history(filters or {})
