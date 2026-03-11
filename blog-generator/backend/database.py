"""
MySQL 데이터베이스 설정 및 CRUD 유틸리티
- aiomysql을 사용한 비동기 MySQL 연동
- 커넥션 풀 기반으로 안정적인 연결 관리
"""

import os
import json
import logging
import asyncio
import aiomysql
from pathlib import Path
from datetime import datetime, timedelta

logger = logging.getLogger("database")

# .env 파일 직접 파싱 (Windows에서 load_dotenv 미동작 문제 해결)
def _load_env_file(env_path):
    env_path = Path(env_path)
    # .env 파일이 없으면 .env.example에서 자동 복사
    if not env_path.exists():
        example = env_path.parent / ".env.example"
        if example.exists():
            import shutil
            shutil.copy(example, env_path)
            logger.info(f".env.example → .env 자동 복사 완료. .env 파일을 수정하세요: {env_path}")
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key:
                        os.environ[key] = value
    except FileNotFoundError:
        logger.warning(f".env 파일을 찾을 수 없습니다: {env_path}")

_load_env_file(Path(__file__).resolve().parent.parent / ".env")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
COOKIE_DIR = DATA_DIR / "cookies"

# MySQL 연결 설정 (환경변수에서 읽기)
MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "dailyfni")

print(f"[database] MySQL 연결 정보: host={MYSQL_HOST}, port={MYSQL_PORT}, user={MYSQL_USER}, db={MYSQL_DB}, password_length={len(MYSQL_PASSWORD)}")

# 커넥션 풀
_pool: aiomysql.Pool = None


async def _get_pool() -> aiomysql.Pool:
    """커넥션 풀 반환 (싱글톤, 연결 실패 시 재시도)"""
    global _pool
    if _pool is None or _pool.closed:
        # 기본 연결 설정
        pool_kwargs = dict(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            db=MYSQL_DB,
            charset="utf8mb4",
            autocommit=True,
            minsize=1,
            maxsize=10,
            cursorclass=aiomysql.DictCursor,
            connect_timeout=10,
        )
        # MySQL 8.0 caching_sha2_password 인증 지원 확인
        try:
            import cryptography  # noqa: F401
            _has_cryptography = True
        except ImportError:
            _has_cryptography = False

        # 시도할 인증 방식 목록
        auth_attempts = [{}]  # 기본(서버 기본 플러그인)
        if not _has_cryptography:
            # cryptography 없으면 mysql_native_password 폴백 추가
            auth_attempts.append({"auth_plugin": "mysql_native_password"})

        last_error = None
        for auth_extra in auth_attempts:
            kwargs = {**pool_kwargs, **auth_extra}
            auth_label = auth_extra.get("auth_plugin", "default")
            for attempt in range(3):
                try:
                    _pool = await aiomysql.create_pool(**kwargs)
                    if auth_extra:
                        logger.info(f"MySQL 연결 성공 (auth_plugin={auth_label})")
                    return _pool
                except Exception as e:
                    last_error = e
                    wait = 2 ** attempt
                    logger.warning(f"MySQL 연결 실패 (auth={auth_label}, 시도 {attempt + 1}/3): {e}. {wait}초 후 재시도...")
                    await asyncio.sleep(wait)

        # 모든 시도 실패 시 cryptography 안내 추가
        if not _has_cryptography:
            logger.error("MySQL 8.0 인증 실패: 'pip install cryptography' 실행 후 재시도하세요.")
        raise last_error
    return _pool


async def close_pool():
    """커넥션 풀 종료 (graceful shutdown)"""
    global _pool
    if _pool is not None and not _pool.closed:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


async def init_db():
    """데이터베이스 초기화 및 테이블 생성"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    COOKIE_DIR.mkdir(parents=True, exist_ok=True)

    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # MySQL strict mode 임시 해제 (기존 TEXT DEFAULT 호환)
            await cur.execute("SET @saved_sql_mode = @@SESSION.sql_mode")
            await cur.execute("SET SESSION sql_mode = ''")

            # gemini_images 마이그레이션은 publish_history CREATE TABLE 이후로 이동 (아래 참조)

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS accounts (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    account_name VARCHAR(255) NOT NULL,
                    naver_id TEXT NOT NULL,
                    naver_password TEXT NOT NULL,
                    cookie_file_path VARCHAR(500) DEFAULT '',
                    default_category_id BIGINT DEFAULT NULL,
                    specialty VARCHAR(500) DEFAULT '',
                    last_used VARCHAR(50) DEFAULT '',
                    account_group VARCHAR(20) DEFAULT 'ad',
                    account_tier INT DEFAULT 1,
                    is_active TINYINT DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # account_group 컬럼 마이그레이션 (기존 DB 호환)
            try:
                await cur.execute("""
                    ALTER TABLE accounts ADD COLUMN account_group VARCHAR(20) DEFAULT 'ad'
                """)
            except Exception:
                pass  # 이미 존재하면 무시

            # account_tier 컬럼 마이그레이션 + 기존 데이터 변환
            try:
                await cur.execute("ALTER TABLE accounts ADD COLUMN account_tier INT DEFAULT 1")
                # 기존 account_group → account_tier 변환 (ad=5, general=1)
                await cur.execute("UPDATE accounts SET account_tier = 5 WHERE account_group = 'ad' AND account_tier = 1")
            except Exception:
                pass  # 이미 존재

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS categories (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    account_id BIGINT NOT NULL,
                    category_name VARCHAR(255) NOT NULL,
                    is_default TINYINT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS publish_batches (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    keyword VARCHAR(500) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    scheduled_start_time VARCHAR(50) DEFAULT '',
                    status VARCHAR(50) DEFAULT 'pending',
                    post_type VARCHAR(20) DEFAULT 'ad',
                    total_count INT DEFAULT 3,
                    success_count INT DEFAULT 0,
                    failed_count INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS publish_history (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    batch_id BIGINT,
                    document_number INT DEFAULT 1,
                    account_id BIGINT,
                    category_id BIGINT,
                    title TEXT DEFAULT (''),
                    content LONGTEXT,
                    keywords TEXT DEFAULT ('[]'),
                    published_at VARCHAR(50) DEFAULT '',
                    scheduled_time VARCHAR(50) DEFAULT '',
                    status VARCHAR(50) DEFAULT 'pending',
                    error_message TEXT,
                    naver_post_url VARCHAR(1000) DEFAULT '',
                    document_format VARCHAR(50) DEFAULT 'tutorial',
                    gemini_images TEXT NULL DEFAULT '[]',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (batch_id) REFERENCES publish_batches(id) ON DELETE CASCADE,
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
                    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # gemini_images 컬럼: 기존 테이블에 없거나 NOT NULL이면 수정
            try:
                await cur.execute(
                    "SELECT IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'publish_history' AND COLUMN_NAME = 'gemini_images'"
                )
                col_info = await cur.fetchone()
                if col_info:
                    # 컬럼 존재 → 항상 NULL 허용 + 기본값 '[]' 보장
                    needs_fix = (
                        col_info.get("IS_NULLABLE") != "YES"
                        or col_info.get("COLUMN_DEFAULT") is None
                        or col_info.get("COLUMN_DEFAULT") == ""
                    )
                    if needs_fix:
                        await cur.execute("ALTER TABLE publish_history MODIFY COLUMN gemini_images TEXT NULL DEFAULT '[]'")
                        logger.info("gemini_images 컬럼을 NULL DEFAULT '[]'로 수정 완료")
                else:
                    # 컬럼 없음 → 추가
                    await cur.execute("ALTER TABLE publish_history ADD COLUMN gemini_images TEXT NULL DEFAULT '[]'")
                    logger.info("gemini_images 컬럼 추가 완료")
            except Exception as e:
                logger.warning(f"gemini_images 컬럼 마이그레이션 실패: {e}")

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS keyword_queue (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    keyword VARCHAR(500) NOT NULL,
                    product_info TEXT DEFAULT (''),
                    priority VARCHAR(20) DEFAULT 'ad',
                    status VARCHAR(20) DEFAULT 'pending',
                    last_used_at VARCHAR(50) DEFAULT '',
                    next_available_at VARCHAR(50) DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    used_count INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS keyword_stats (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    keyword VARCHAR(500) NOT NULL,
                    account_id BIGINT,
                    used_count INT DEFAULT 0,
                    last_used_at VARCHAR(50) DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    type VARCHAR(20) DEFAULT 'info',
                    title VARCHAR(500) NOT NULL,
                    message TEXT DEFAULT (''),
                    is_read TINYINT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            await cur.execute("""
                CREATE TABLE IF NOT EXISTS scheduler_config (
                    id BIGINT PRIMARY KEY,
                    is_active TINYINT DEFAULT 0,
                    start_hour INT DEFAULT 8,
                    start_minute INT DEFAULT 0,
                    end_hour INT DEFAULT 10,
                    end_minute INT DEFAULT 0,
                    days_of_week VARCHAR(100) DEFAULT '[1,2,3,4,5]',
                    min_interval_hours INT DEFAULT 2,
                    max_interval_hours INT DEFAULT 4,
                    random_rest_enabled TINYINT DEFAULT 1,
                    random_rest_percent INT DEFAULT 10,
                    weekend_low_prob TINYINT DEFAULT 1,
                    weekend_prob_percent INT DEFAULT 30,
                    consecutive_publish_days INT DEFAULT 0,
                    last_publish_date VARCHAR(50) DEFAULT '',
                    footer_link VARCHAR(500) DEFAULT '',
                    footer_link_text VARCHAR(200) DEFAULT '',
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # 기존 테이블에 footer_link 컬럼 추가 (없을 때만)
            for col, col_def in [
                ("footer_link", "VARCHAR(500) DEFAULT ''"),
                ("footer_link_text", "VARCHAR(200) DEFAULT ''"),
            ]:
                try:
                    await cur.execute(f"ALTER TABLE scheduler_config ADD COLUMN {col} {col_def}")
                except Exception:
                    pass  # 이미 존재

            # 기본 스케줄러 설정 삽입 (없을 때만)
            await cur.execute("SELECT COUNT(*) AS cnt FROM scheduler_config WHERE id = 1")
            row = await cur.fetchone()
            if row["cnt"] == 0:
                await cur.execute("INSERT INTO scheduler_config (id) VALUES (1)")

            # ─── 참여(공감/댓글) 이력 테이블 ───
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS engagement_history (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    account_id BIGINT NOT NULL,
                    post_url VARCHAR(500) NOT NULL,
                    post_title VARCHAR(300) DEFAULT '',
                    like_success TINYINT DEFAULT 0,
                    comment_success TINYINT DEFAULT 0,
                    comment_text TEXT,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """)

            # ─── accounts에 proxy 컬럼 추가 (없을 때만) ───
            for col, col_def in [
                ("proxy_server", "TEXT DEFAULT NULL"),
                ("proxy_username", "TEXT DEFAULT NULL"),
                ("proxy_password", "TEXT DEFAULT NULL"),
            ]:
                try:
                    await cur.execute(f"ALTER TABLE accounts ADD COLUMN {col} {col_def}")
                except Exception:
                    pass  # 이미 존재

            # ─── publish_batches에 post_type 컬럼 추가 (없을 때만) ───
            try:
                await cur.execute("ALTER TABLE publish_batches ADD COLUMN post_type VARCHAR(20) DEFAULT 'ad'")
            except Exception:
                pass  # 이미 존재

            # ─── priority 값 마이그레이션 (high/medium/low → ad/general) ───
            try:
                await cur.execute("""
                    UPDATE keyword_queue
                    SET priority = 'ad'
                    WHERE priority = 'high'
                """)
                await cur.execute("""
                    UPDATE keyword_queue
                    SET priority = 'general'
                    WHERE priority IN ('medium', 'low')
                """)
            except Exception:
                pass

            # ─── priority 기본값 변경 ───
            try:
                await cur.execute("""
                    ALTER TABLE keyword_queue
                    ALTER COLUMN priority SET DEFAULT 'ad'
                """)
            except Exception:
                pass

            # ─── 교대 발행 설정 컬럼 추가 (scheduler_config) ───
            for col, col_def in [
                ("last_post_type", "VARCHAR(20) DEFAULT ''"),
            ]:
                try:
                    await cur.execute(f"ALTER TABLE scheduler_config ADD COLUMN {col} {col_def}")
                except Exception:
                    pass  # 이미 존재

            # ─── 참여 설정 컬럼 추가 (scheduler_config) ───
            for col, col_def in [
                ("engagement_enabled", "TINYINT DEFAULT 0"),
                ("engagement_hour", "INT DEFAULT 14"),
                ("engagement_minute", "INT DEFAULT 0"),
                ("engagement_max_posts", "INT DEFAULT 10"),
                ("engagement_do_like", "TINYINT DEFAULT 1"),
                ("engagement_do_comment", "TINYINT DEFAULT 1"),
                ("engagement_account_ids", "TEXT DEFAULT NULL"),
            ]:
                try:
                    await cur.execute(f"ALTER TABLE scheduler_config ADD COLUMN {col} {col_def}")
                except Exception:
                    pass  # 이미 존재

            # sql_mode 복원
            await cur.execute("SET SESSION sql_mode = @saved_sql_mode")


# ─── 계정 CRUD ──────────────────────────────────────────

async def create_account(data: dict) -> dict:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO accounts (account_name, naver_id, naver_password, specialty, account_group, account_tier)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (data["account_name"], data["naver_id"], data["naver_password"], data.get("specialty", ""),
                 data.get("account_group", "ad"), data.get("account_tier", 1)),
            )
            account_id = cur.lastrowid
            await cur.execute("SELECT * FROM accounts WHERE id = %s", (account_id,))
            return await cur.fetchone()


async def get_accounts() -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM accounts ORDER BY created_at DESC")
            return list(await cur.fetchall())


async def get_account(account_id: int) -> dict | None:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM accounts WHERE id = %s", (account_id,))
            return await cur.fetchone()


async def update_account(account_id: int, data: dict) -> dict | None:
    fields = []
    values = []
    for key in ["account_name", "naver_id", "naver_password", "specialty", "account_group", "account_tier", "is_active", "default_category_id", "cookie_file_path", "last_used"]:
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data[key])
    if not fields:
        return await get_account(account_id)
    values.append(account_id)
    sql = f"UPDATE accounts SET {', '.join(fields)} WHERE id = %s"
    logger.warning(f"[DEBUG] update_account SQL: {sql}, values: {values}")

    # 풀 커넥션의 autocommit/트랜잭션 상태를 신뢰하지 않고
    # 새 커넥션으로 직접 연결하여 UPDATE + 결과 읽기를 한 번에 처리
    import aiomysql
    conn = await aiomysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER,
        password=MYSQL_PASSWORD, db=MYSQL_DB, charset="utf8mb4",
        autocommit=True, cursorclass=aiomysql.DictCursor,
    )
    try:
        async with conn.cursor() as cur:
            await cur.execute(sql, values)
            logger.warning(f"[DEBUG] rowcount: {cur.rowcount}")
            # 같은 커넥션에서 결과 읽기
            await cur.execute("SELECT * FROM accounts WHERE id = %s", (account_id,))
            result = await cur.fetchone()
            logger.warning(f"[DEBUG] 결과: account_tier={result.get('account_tier') if result else 'None'}")
    finally:
        conn.close()
    return result


async def delete_account(account_id: int) -> bool:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM accounts WHERE id = %s", (account_id,))
            return cur.rowcount > 0


async def update_account_proxy(account_id: int, server: str, username: str = "", password: str = ""):
    """프록시 정보를 AES-256 암호화하여 저장"""
    from crypto import encrypt
    enc_server = encrypt(server) if server else None
    enc_username = encrypt(username) if username else None
    enc_password = encrypt(password) if password else None
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE accounts SET proxy_server = %s, proxy_username = %s, proxy_password = %s WHERE id = %s",
                (enc_server, enc_username, enc_password, account_id),
            )


async def delete_account_proxy(account_id: int):
    """프록시 정보 제거"""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE accounts SET proxy_server = NULL, proxy_username = NULL, proxy_password = NULL WHERE id = %s",
                (account_id,),
            )


async def get_account_proxy(account_id: int) -> dict | None:
    """복호화된 프록시 정보 반환. 없거나 복호화 실패 시 None."""
    from crypto import decrypt
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT proxy_server, proxy_username, proxy_password FROM accounts WHERE id = %s",
                (account_id,),
            )
            row = await cur.fetchone()
            if not row or not row.get("proxy_server"):
                return None
            try:
                server = decrypt(row["proxy_server"])
            except Exception:
                # 하위 호환: 평문으로 저장된 경우 원본 반환
                server = row["proxy_server"]
            try:
                username = decrypt(row["proxy_username"]) if row.get("proxy_username") else ""
            except Exception:
                username = row.get("proxy_username", "")
            try:
                password = decrypt(row["proxy_password"]) if row.get("proxy_password") else ""
            except Exception:
                password = row.get("proxy_password", "")
            return {"server": server, "username": username, "password": password}


# ─── 카테고리 CRUD ──────────────────────────────────────

async def create_category(data: dict) -> dict:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            if data.get("is_default"):
                await cur.execute("UPDATE categories SET is_default = 0 WHERE account_id = %s", (data["account_id"],))
            await cur.execute(
                "INSERT INTO categories (account_id, category_name, is_default) VALUES (%s, %s, %s)",
                (data["account_id"], data["category_name"], 1 if data.get("is_default") else 0),
            )
            await cur.execute("SELECT * FROM categories WHERE id = %s", (cur.lastrowid,))
            return await cur.fetchone()


async def get_categories(account_id: int) -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM categories WHERE account_id = %s ORDER BY is_default DESC, category_name",
                (account_id,),
            )
            return list(await cur.fetchall())


async def update_category(cat_id: int, data: dict) -> dict | None:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            if data.get("is_default"):
                await cur.execute("SELECT account_id FROM categories WHERE id = %s", (cat_id,))
                cat = await cur.fetchone()
                if cat:
                    await cur.execute("UPDATE categories SET is_default = 0 WHERE account_id = %s", (cat["account_id"],))
            fields = []
            values = []
            for key in ["category_name", "is_default"]:
                if key in data:
                    fields.append(f"{key} = %s")
                    values.append(data[key])
            if fields:
                values.append(cat_id)
                await cur.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = %s", values)
            await cur.execute("SELECT * FROM categories WHERE id = %s", (cat_id,))
            return await cur.fetchone()


async def delete_category(cat_id: int) -> bool:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM categories WHERE id = %s", (cat_id,))
            return cur.rowcount > 0


# ─── 발행 배치 CRUD ──────────────────────────────────────

async def create_batch(keyword: str, scheduled_start_time: str = "", post_type: str = "ad") -> dict:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO publish_batches (keyword, scheduled_start_time, post_type) VALUES (%s, %s, %s)",
                (keyword, scheduled_start_time, post_type),
            )
            last_id = cur.lastrowid
            if not last_id:
                logger.warning(f"create_batch: lastrowid가 없음 (keyword={keyword})")
                return None
            await cur.execute("SELECT * FROM publish_batches WHERE id = %s", (last_id,))
            result = await cur.fetchone()
            if not result:
                logger.warning(f"create_batch: fetchone 실패 (lastrowid={last_id}, keyword={keyword})")
            return result


async def get_batches(limit: int = 50, offset: int = 0) -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM publish_batches ORDER BY created_at DESC LIMIT %s OFFSET %s",
                (limit, offset),
            )
            return list(await cur.fetchall())


async def get_batch(batch_id: int) -> dict | None:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM publish_batches WHERE id = %s", (batch_id,))
            return await cur.fetchone()


async def update_batch(batch_id: int, data: dict):
    fields = []
    values = []
    for key in ["status", "success_count", "failed_count", "scheduled_start_time"]:
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data[key])
    if fields:
        values.append(batch_id)
        pool = await _get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"UPDATE publish_batches SET {', '.join(fields)} WHERE id = %s", values)


# ─── 발행 이력 CRUD ──────────────────────────────────────

async def create_publish_history(data: dict) -> dict:
    pool = await _get_pool()
    params = (
        data["batch_id"], data.get("document_number", 1),
        data.get("account_id"), data.get("category_id"),
        data.get("title", ""), data.get("content", ""),
        json.dumps(data.get("keywords", []), ensure_ascii=False),
        data.get("scheduled_time", ""),
        data.get("document_format", "tutorial"),
        json.dumps(data.get("gemini_images", []), ensure_ascii=False),
    )
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(
                    """INSERT INTO publish_history
                       (batch_id, document_number, account_id, category_id, title, content, keywords, scheduled_time, document_format, gemini_images)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    params,
                )
            except Exception as e:
                if getattr(e, 'args', (None,))[0] == 1364:
                    # 컬럼이 NOT NULL without default → 자동 수정 후 재시도
                    logger.warning(f"publish_history 컬럼 스키마 자동 수정 중: {e}")
                    await cur.execute("ALTER TABLE publish_history MODIFY COLUMN gemini_images TEXT NULL DEFAULT '[]'")
                    await conn.commit()
                    await cur.execute(
                        """INSERT INTO publish_history
                           (batch_id, document_number, account_id, category_id, title, content, keywords, scheduled_time, document_format, gemini_images)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        params,
                    )
                else:
                    raise
            await cur.execute("SELECT * FROM publish_history WHERE id = %s", (cur.lastrowid,))
            return await cur.fetchone()


async def update_publish_history(history_id: int, data: dict):
    fields = []
    values = []
    for key in ["status", "error_message", "naver_post_url", "published_at", "account_id", "category_id", "scheduled_time", "gemini_images"]:
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data[key])
    if fields:
        values.append(history_id)
        pool = await _get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"UPDATE publish_history SET {', '.join(fields)} WHERE id = %s", values)


async def get_publish_history(filters: dict = None) -> list:
    filters = filters or {}
    query = """SELECT ph.*, a.account_name, c.category_name
               FROM publish_history ph
               LEFT JOIN accounts a ON ph.account_id = a.id
               LEFT JOIN categories c ON ph.category_id = c.id
               WHERE 1=1"""
    params = []

    if filters.get("account_id"):
        query += " AND ph.account_id = %s"
        params.append(filters["account_id"])
    if filters.get("batch_id"):
        query += " AND ph.batch_id = %s"
        params.append(filters["batch_id"])
    if filters.get("status"):
        query += " AND ph.status = %s"
        params.append(filters["status"])
    if filters.get("keyword"):
        query += " AND (ph.title LIKE %s OR ph.keywords LIKE %s)"
        kw = f"%{filters['keyword']}%"
        params.extend([kw, kw])
    if filters.get("date_from"):
        query += " AND ph.created_at >= %s"
        params.append(filters["date_from"])
    if filters.get("date_to"):
        query += " AND ph.created_at <= %s"
        params.append(filters["date_to"])

    query += " ORDER BY ph.created_at DESC"
    limit = filters.get("limit", 100)
    offset = filters.get("offset", 0)
    query += " LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return list(await cur.fetchall())


async def get_batch_history(batch_id: int) -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT ph.*, a.account_name, c.category_name
                   FROM publish_history ph
                   LEFT JOIN accounts a ON ph.account_id = a.id
                   LEFT JOIN categories c ON ph.category_id = c.id
                   WHERE ph.batch_id = %s ORDER BY ph.document_number""",
                (batch_id,),
            )
            return list(await cur.fetchall())


# ─── 키워드 큐 CRUD ──────────────────────────────────────

async def add_keyword(data: dict) -> dict:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO keyword_queue (keyword, product_info, priority) VALUES (%s, %s, %s)",
                (data["keyword"], data.get("product_info", ""), data.get("priority", "ad")),
            )
            await cur.execute("SELECT * FROM keyword_queue WHERE id = %s", (cur.lastrowid,))
            return await cur.fetchone()


async def add_keywords_bulk(keywords: list) -> int:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            count = 0
            for kw in keywords:
                keyword = kw if isinstance(kw, str) else kw.get("keyword", "")
                priority = "ad" if isinstance(kw, str) else kw.get("priority", "ad")
                product_info = "" if isinstance(kw, str) else kw.get("product_info", "")
                if keyword.strip():
                    await cur.execute(
                        "INSERT INTO keyword_queue (keyword, product_info, priority) VALUES (%s, %s, %s)",
                        (keyword.strip(), product_info, priority),
                    )
                    count += 1
            return count


async def get_keywords(status: str = None) -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            query = "SELECT * FROM keyword_queue"
            params = []
            if status:
                query += " WHERE status = %s"
                params.append(status)
            query += " ORDER BY FIELD(priority, 'ad', 'general'), created_at ASC"
            await cur.execute(query, params)
            return list(await cur.fetchall())


async def get_next_keyword(preferred_type: str = "", account_id: int | None = None) -> dict | None:
    """키워드 큐에서 다음 키워드를 가져온다.
    preferred_type이 'ad' 또는 'general'이면 해당 타입 키워드만 가져온다.
    지정하지 않으면 ad 우선으로 가져온다.

    account_id가 주어지면 교차 발행을 지원한다:
    - 먼저 status='pending' 키워드를 시도
    - 없으면 general 키워드 중 status='used'이지만 해당 계정이 아직 사용하지 않고
      마지막 사용으로부터 1일이 지난 키워드를 재사용
    """
    now = datetime.now().isoformat()
    one_day_ago = (datetime.now() - timedelta(days=1)).isoformat()
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # 1단계: status='pending' 키워드 조회 (기존 로직)
            if preferred_type in ("ad", "general"):
                await cur.execute(
                    """SELECT * FROM keyword_queue
                       WHERE status = 'pending'
                       AND priority = %s
                       AND (next_available_at = '' OR next_available_at <= %s)
                       ORDER BY created_at ASC
                       LIMIT 1""",
                    (preferred_type, now),
                )
            else:
                await cur.execute(
                    """SELECT * FROM keyword_queue
                       WHERE status = 'pending'
                       AND (next_available_at = '' OR next_available_at <= %s)
                       ORDER BY FIELD(priority, 'ad', 'general'),
                                created_at ASC
                       LIMIT 1""",
                    (now,),
                )
            result = await cur.fetchone()
            if result:
                return result

            # 2단계: general 키워드 교차 발행 재사용
            # account_id가 있고, general 타입일 때만 시도
            if account_id and preferred_type in ("general", ""):
                type_filter = "AND kq.priority = 'general'" if preferred_type == "" else ""
                await cur.execute(
                    f"""SELECT kq.* FROM keyword_queue kq
                       WHERE kq.status = 'used'
                       AND kq.priority = 'general'
                       {type_filter}
                       AND kq.last_used_at != ''
                       AND kq.last_used_at <= %s
                       AND kq.id NOT IN (
                           SELECT kq2.id FROM keyword_queue kq2
                           INNER JOIN keyword_stats ks
                               ON ks.keyword = kq2.keyword AND ks.account_id = %s
                           WHERE kq2.status = 'used' AND kq2.priority = 'general'
                       )
                       ORDER BY kq.used_count ASC, kq.created_at ASC
                       LIMIT 1""",
                    (one_day_ago, account_id),
                )
                return await cur.fetchone()

            return None


async def update_keyword(kw_id: int, data: dict):
    fields = []
    values = []
    for key in ["keyword", "product_info", "priority", "status", "last_used_at", "next_available_at", "used_count"]:
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data[key])
    if fields:
        values.append(kw_id)
        pool = await _get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"UPDATE keyword_queue SET {', '.join(fields)} WHERE id = %s", values)


async def delete_keyword(kw_id: int) -> bool:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM keyword_queue WHERE id = %s", (kw_id,))
            return cur.rowcount > 0


# ─── 키워드 통계 ──────────────────────────────────────

async def update_keyword_stats(keyword: str, account_id: int):
    now = datetime.now().isoformat()
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id FROM keyword_stats WHERE keyword = %s AND account_id = %s",
                (keyword, account_id),
            )
            existing = await cur.fetchone()
            if existing:
                await cur.execute(
                    "UPDATE keyword_stats SET used_count = used_count + 1, last_used_at = %s WHERE keyword = %s AND account_id = %s",
                    (now, keyword, account_id),
                )
            else:
                await cur.execute(
                    "INSERT INTO keyword_stats (keyword, account_id, used_count, last_used_at) VALUES (%s, %s, 1, %s)",
                    (keyword, account_id, now),
                )


async def get_keyword_stats_top(limit: int = 10) -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT keyword, SUM(used_count) AS total_count, MAX(last_used_at) AS last_used
                   FROM keyword_stats GROUP BY keyword ORDER BY total_count DESC LIMIT %s""",
                (limit,),
            )
            return list(await cur.fetchall())


async def get_dashboard_stats() -> dict:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            # 총 발행 수
            await cur.execute("SELECT COUNT(*) AS cnt FROM publish_history WHERE status = 'success'")
            total_success = (await cur.fetchone())["cnt"]

            await cur.execute("SELECT COUNT(*) AS cnt FROM publish_history WHERE status = 'failed'")
            total_failed = (await cur.fetchone())["cnt"]

            # 계정별 발행 현황
            await cur.execute(
                """SELECT a.account_name, COUNT(ph.id) AS count
                   FROM publish_history ph JOIN accounts a ON ph.account_id = a.id
                   WHERE ph.status = 'success'
                   GROUP BY ph.account_id, a.account_name ORDER BY count DESC"""
            )
            by_account = list(await cur.fetchall())

            # 최근 7일 발행 추이
            await cur.execute(
                """SELECT DATE(published_at) AS date, COUNT(*) AS count
                   FROM publish_history WHERE status = 'success'
                   AND published_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                   GROUP BY DATE(published_at) ORDER BY date"""
            )
            daily_trend = list(await cur.fetchall())

            # 키워드 큐 현황
            await cur.execute("SELECT COUNT(*) AS cnt FROM keyword_queue WHERE status = 'pending'")
            pending_keywords = (await cur.fetchone())["cnt"]

            await cur.execute("SELECT COUNT(*) AS cnt FROM keyword_queue WHERE status = 'used'")
            used_keywords = (await cur.fetchone())["cnt"]

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
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO notifications (type, title, message) VALUES (%s, %s, %s)",
                (ntype, title, message),
            )
            await cur.execute("SELECT * FROM notifications WHERE id = %s", (cur.lastrowid,))
            return await cur.fetchone()


async def get_notifications(unread_only: bool = False) -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            query = "SELECT * FROM notifications"
            if unread_only:
                query += " WHERE is_read = 0"
            query += " ORDER BY created_at DESC LIMIT 100"
            await cur.execute(query)
            return list(await cur.fetchall())


async def mark_notification_read(nid: int):
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE notifications SET is_read = 1 WHERE id = %s", (nid,))


async def delete_notification(nid: int) -> bool:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM notifications WHERE id = %s", (nid,))
            return cur.rowcount > 0


# ─── 스케줄러 설정 ──────────────────────────────────────

async def get_scheduler_config() -> dict:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM scheduler_config WHERE id = 1")
            row = await cur.fetchone()
            if row:
                d = dict(row)
                d["days_of_week"] = json.loads(d["days_of_week"])
                if d.get("engagement_account_ids"):
                    try:
                        d["engagement_account_ids"] = json.loads(d["engagement_account_ids"])
                    except (json.JSONDecodeError, TypeError):
                        d["engagement_account_ids"] = []
                else:
                    d["engagement_account_ids"] = []
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
        if key == "engagement_account_ids" and isinstance(val, list):
            val = json.dumps(val)
        fields.append(f"{key} = %s")
        values.append(val)
    if fields:
        values.append(1)
        pool = await _get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"UPDATE scheduler_config SET {', '.join(fields)} WHERE id = %s", values)


# ─── 중복 키워드 체크 ──────────────────────────────────

async def get_ready_batches() -> list:
    """발행 대기 중인 배치 조회 (status='articles_ready') — 계정명·키워드 포함"""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT pb.*,
                          a.account_name,
                          ph.keywords AS ph_keywords
                   FROM publish_batches pb
                   LEFT JOIN publish_history ph ON ph.batch_id = pb.id
                   LEFT JOIN accounts a ON ph.account_id = a.id
                   WHERE pb.status = 'articles_ready'
                   GROUP BY pb.id
                   ORDER BY pb.created_at ASC"""
            )
            rows = list(await cur.fetchall())
            import json as _json
            for row in rows:
                # keyword가 비어있으면 publish_history.keywords에서 복구
                if not row.get("keyword") and row.get("ph_keywords"):
                    try:
                        kw_list = row["ph_keywords"]
                        if isinstance(kw_list, str):
                            kw_list = _json.loads(kw_list)
                        if isinstance(kw_list, list) and kw_list:
                            row["keyword"] = kw_list[0]
                    except Exception:
                        pass
            return rows


async def get_generated_articles(batch_id: int) -> list:
    """사전 생성된 글 조회 (status='generated')"""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT ph.*, a.account_name, c.category_name
                   FROM publish_history ph
                   LEFT JOIN accounts a ON ph.account_id = a.id
                   LEFT JOIN categories c ON ph.category_id = c.id
                   WHERE ph.batch_id = %s AND ph.status = 'generated'
                   ORDER BY ph.document_number""",
                (batch_id,),
            )
            return list(await cur.fetchall())


async def get_all_generated_articles() -> list:
    """모든 사전 생성된 글 조회 (status='generated')"""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT ph.*, a.account_name, c.category_name, pb.keyword AS batch_keyword
                   FROM publish_history ph
                   LEFT JOIN accounts a ON ph.account_id = a.id
                   LEFT JOIN categories c ON ph.category_id = c.id
                   LEFT JOIN publish_batches pb ON ph.batch_id = pb.id
                   WHERE ph.status = 'generated'
                   ORDER BY ph.created_at DESC"""
            )
            return list(await cur.fetchall())


async def delete_all_history() -> int:
    """모든 발행 이력 및 관련 배치 삭제"""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT COUNT(*) AS cnt FROM publish_history")
            row = await cur.fetchone()
            count = row["cnt"] if row else 0
            await cur.execute("DELETE FROM publish_history")
            await cur.execute("DELETE FROM publish_batches")
            return count


async def check_keyword_duplicate(keyword: str, days: int = 7) -> bool:
    """최근 N일 내에 같은 키워드가 사용되었는지 확인"""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT COUNT(*) AS cnt FROM publish_batches
                   WHERE keyword = %s AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)""",
                (keyword, days),
            )
            row = await cur.fetchone()
            return row["cnt"] > 0


# ─── CSV 내보내기 데이터 ──────────────────────────────────

async def get_export_data(filters: dict = None) -> list:
    """발행 이력을 CSV 내보내기용으로 조회"""
    return await get_publish_history(filters or {})


# ─── 참여(공감/댓글) CRUD ──────────────────────────────────

async def create_engagement(data: dict) -> dict:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO engagement_history
                   (account_id, post_url, post_title, like_success, comment_success,
                    comment_text, error_message)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (
                    data["account_id"], data["post_url"],
                    data.get("post_title", ""),
                    1 if data.get("like_success") else 0,
                    1 if data.get("comment_success") else 0,
                    data.get("comment_text", ""),
                    data.get("error_message", ""),
                ),
            )
            eng_id = cur.lastrowid
            await cur.execute("SELECT * FROM engagement_history WHERE id = %s", (eng_id,))
            return await cur.fetchone()


async def get_engagement_history(limit: int = 100) -> list:
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT eh.*, a.account_name
                   FROM engagement_history eh
                   LEFT JOIN accounts a ON eh.account_id = a.id
                   ORDER BY eh.created_at DESC
                   LIMIT %s""",
                (limit,),
            )
            return list(await cur.fetchall())


async def get_engagement_stats() -> dict:
    """오늘/전체 참여 통계"""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT
                    COUNT(*) AS total,
                    SUM(like_success) AS total_likes,
                    SUM(comment_success) AS total_comments,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_total,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() AND like_success THEN 1 ELSE 0 END) AS today_likes,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() AND comment_success THEN 1 ELSE 0 END) AS today_comments
                FROM engagement_history
            """)
            row = await cur.fetchone()
            return {
                "total": row["total"] or 0,
                "total_likes": int(row["total_likes"] or 0),
                "total_comments": int(row["total_comments"] or 0),
                "today_total": int(row["today_total"] or 0),
                "today_likes": int(row["today_likes"] or 0),
                "today_comments": int(row["today_comments"] or 0),
            }
