"""
main.py - FastAPI 서버
네이버 카페 자동 발행 시스템 API + SSE 실시간 상태 전송
"""

import sys
import json
import asyncio
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database as db
from crypto import encrypt_password, decrypt_password
import scheduler as sched
import telegram_notifier as tg

# ─── 로깅 ─────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    force=True,
)
logger = logging.getLogger(__name__)

# cafe_publisher / scheduler 로거가 반드시 콘솔에 출력되도록 보장
for _name in ("cafe_publisher", "scheduler"):
    _lg = logging.getLogger(_name)
    _lg.setLevel(logging.DEBUG)
    if not _lg.handlers:
        _lg.addHandler(logging.StreamHandler())
        _lg.handlers[-1].setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )

# ─── FastAPI 앱 ────────────────────────────────────────────

app = FastAPI(title="네이버 카페 매크로 - DailyFNI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 프론트엔드 정적 파일
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.on_event("startup")
async def startup():
    db.init_db()
    # uvicorn reload 시 dictConfig가 핸들러를 덮어쓸 수 있으므로 검증
    for _name in ("cafe_publisher", "scheduler"):
        _lg = logging.getLogger(_name)
        _lg.setLevel(logging.DEBUG)
        has_stderr = any(
            isinstance(h, logging.StreamHandler) and getattr(h, 'stream', None) is sys.stderr
            for h in _lg.handlers
        )
        if not has_stderr:
            _sh = logging.StreamHandler(sys.stderr)
            _sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
            _lg.addHandler(_sh)
        logger.info(f"{_name} 로거 핸들러={len(_lg.handlers)}개, propagate={_lg.propagate}")
    logger.info("DB 초기화 완료")
    # 스케줄러 자동 시작 (서버 재시작 시 자동 활성화)
    await sched.start_scheduler()
    logger.info("스케줄러 자동 시작 완료")


@app.get("/")
def serve_frontend():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# ─── Request/Response Models ──────────────────────────────

class AccountCreate(BaseModel):
    username: str
    password: str

class CafeBoardCreate(BaseModel):
    cafe_url: str
    board_name: str
    menu_id: Optional[str] = ""
    cafe_group_id: Optional[int] = None

class CafeCreate(BaseModel):
    cafe_id: str
    name: Optional[str] = ""

class CafeSettingsUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[int] = None
    interval_min: Optional[int] = None
    interval_max: Optional[int] = None
    daily_post_limit: Optional[int] = None
    daily_comment_limit: Optional[int] = None
    comments_per_post: Optional[int] = None
    comment_delay_min: Optional[int] = None
    comment_delay_max: Optional[int] = None
    comment_order: Optional[str] = None
    exclude_author: Optional[int] = None

class KeywordCreate(BaseModel):
    text: str
    description: str = ""

class CommentTemplateCreate(BaseModel):
    text: str

class CafeAccountMapping(BaseModel):
    account_ids: list[int]

class KeywordBoardMapping(BaseModel):
    board_ids: list[int]

class KeywordCommentMapping(BaseModel):
    template_ids: list[int]

class TelegramConfigUpdate(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    enabled: Optional[int] = None
    notify_success: Optional[int] = None
    notify_failure: Optional[int] = None
    notify_batch_summary: Optional[int] = None


class ScheduleConfigUpdate(BaseModel):
    days: Optional[str] = None
    times: Optional[str] = None
    interval_min: Optional[int] = None
    interval_max: Optional[int] = None
    random_delay_min: Optional[int] = None
    random_delay_max: Optional[int] = None
    comment_enabled: Optional[int] = None
    comments_per_post: Optional[int] = None
    comment_delay_min: Optional[int] = None
    comment_delay_max: Optional[int] = None
    comment_order: Optional[str] = None
    exclude_author: Optional[int] = None
    cross_publish: Optional[int] = None
    account_interval_hours: Optional[int] = None
    max_accounts_per_run: Optional[int] = None
    base_start_hour: Optional[int] = None
    base_start_minute: Optional[int] = None
    daily_shift_minutes: Optional[int] = None
    daily_post_limit: Optional[int] = None
    daily_comment_limit: Optional[int] = None
    footer_link: Optional[str] = None
    footer_link_text: Optional[str] = None


def _mask_proxy_server(server: str) -> str:
    """프록시 서버 주소를 부분 마스킹: 123.45.67.89:10001 → 123.45.***.***:10001"""
    if not server:
        return ""
    # scheme 분리
    scheme = ""
    addr = server
    if "://" in server:
        scheme, addr = server.split("://", 1)
        scheme += "://"
    # host:port 분리
    if ":" in addr:
        parts = addr.rsplit(":", 1)
        host, port = parts[0], ":" + parts[1]
    else:
        host, port = addr, ""
    # IP 형태면 일부 마스킹 (첫 옥텟만 표시)
    octets = host.split(".")
    if len(octets) == 4:
        masked = octets[0] + ".***.***." + octets[3]
    else:
        # 도메인이면 앞 4자만 표시
        masked = host[:4] + "****" if len(host) > 4 else host
    return scheme + masked + port


# ─── Accounts API ──────────────────────────────────────────

@app.get("/api/accounts")
def list_accounts():
    accounts = db.get_accounts()
    for acc in accounts:
        # 비밀번호 마스킹
        acc["password_enc"] = "••••••••"
        # 프록시 정보: 서버 주소는 부분 마스킹하여 표시
        acc["has_proxy"] = bool(acc.get("proxy_server"))
        if acc.get("proxy_server"):
            proxy = db.get_account_proxy(acc["id"])
            acc["proxy_server_masked"] = _mask_proxy_server(proxy["server"]) if proxy else "프록시 설정됨"
        else:
            acc["proxy_server_masked"] = None
        acc["proxy_server"] = None
        acc["proxy_username"] = "••••••••" if acc.get("proxy_username") else None
        acc["proxy_password"] = None
    return accounts


@app.post("/api/accounts")
def create_account(req: AccountCreate):
    if not req.username.strip() or not req.password.strip():
        raise HTTPException(400, "아이디와 비밀번호를 입력하세요.")
    try:
        enc = encrypt_password(req.password)
        aid = db.add_account(req.username.strip(), enc)
        return {"id": aid, "message": "계정 등록 완료"}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(400, "이미 등록된 아이디입니다.")
        raise HTTPException(500, str(e))


@app.put("/api/accounts/{account_id}/toggle")
def toggle_account(account_id: int):
    db.toggle_account(account_id)
    return {"message": "계정 상태 변경됨"}



@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int):
    try:
        db.delete_account(account_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"계정 삭제 실패: {e}")
    return {"message": "계정 삭제됨"}


# ─── Cafes API ────────────────────────────────────────────

@app.get("/api/cafes")
def list_cafes():
    return db.get_cafes()


@app.post("/api/cafes")
def create_cafe(req: CafeCreate):
    if not req.cafe_id.strip():
        raise HTTPException(400, "카페 ID를 입력하세요.")
    try:
        cid = db.add_cafe(req.cafe_id.strip(), (req.name or "").strip())
        return {"id": cid, "message": "카페 등록 완료"}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(400, "이미 등록된 카페입니다.")
        raise HTTPException(500, str(e))


@app.put("/api/cafes/{cafe_id}")
def update_cafe(cafe_id: int, req: CafeSettingsUpdate):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if updates:
        db.update_cafe_settings(cafe_id, **updates)
    return {"message": "카페 설정 업데이트됨"}


@app.delete("/api/cafes/{cafe_id}")
def delete_cafe(cafe_id: int):
    db.delete_cafe(cafe_id)
    return {"message": "카페 삭제됨"}


@app.get("/api/cafes/{cafe_id}/accounts")
def get_cafe_accounts(cafe_id: int):
    return db.get_cafe_accounts(cafe_id)


@app.put("/api/cafes/{cafe_id}/accounts")
def set_cafe_accounts(cafe_id: int, req: CafeAccountMapping):
    db.set_cafe_accounts(cafe_id, req.account_ids)
    return {"message": "카페 계정 매핑 업데이트됨"}


@app.put("/api/cafes/{cafe_id}/default_board")
def set_default_board(cafe_id: int, req: dict):
    board_id = req.get("board_id")
    conn = db.get_connection()
    try:
        conn.execute("UPDATE cafes SET default_board_id = ? WHERE id = ?", (board_id, cafe_id))
        conn.commit()
    finally:
        conn.close()
    return {"message": "기본 게시판 설정 완료"}


# ─── Cafe Boards API ──────────────────────────────────────

@app.get("/api/boards")
def list_boards():
    return db.get_cafe_boards()


@app.post("/api/boards")
def create_board(req: CafeBoardCreate):
    if not req.cafe_url.strip() or not req.board_name.strip():
        raise HTTPException(400, "카페 ID와 게시판 이름을 입력하세요.")
    bid = db.add_cafe_board(
        req.cafe_url.strip(), req.board_name.strip(),
        (req.menu_id or "").strip(), req.cafe_group_id
    )
    return {"id": bid, "message": "게시판 등록 완료"}


@app.delete("/api/boards/{board_id}")
def delete_board(board_id: int):
    db.delete_cafe_board(board_id)
    return {"message": "게시판 삭제됨"}


# ─── Keywords API ──────────────────────────────────────────

@app.get("/api/keywords")
def list_keywords():
    return db.get_keywords()


@app.post("/api/keywords")
def create_keyword(req: KeywordCreate):
    logger.info(f"[API] POST /api/keywords text='{req.text}' desc='{req.description}'")
    if not req.text.strip():
        raise HTTPException(400, "키워드를 입력하세요.")
    try:
        kid = db.add_keyword(req.text.strip(), req.description.strip())
        logger.info(f"[API] 키워드 등록 완료 id={kid}")
        return {"id": kid, "message": "키워드 등록 완료"}
    except Exception as e:
        logger.error(f"[API] 키워드 등록 실패: {e}", exc_info=True)
        if "UNIQUE" in str(e):
            raise HTTPException(400, "이미 등록된 키워드입니다.")
        raise HTTPException(500, str(e))


@app.delete("/api/keywords/{keyword_id}")
def delete_keyword(keyword_id: int):
    logger.info(f"[API] DELETE /api/keywords/{keyword_id}")
    try:
        db.delete_keyword(keyword_id)
        logger.info(f"[API] 키워드 삭제 완료 id={keyword_id}")
    except Exception as e:
        logger.error(f"[API] 키워드 삭제 실패: {e}", exc_info=True)
        raise HTTPException(500, str(e))
    return {"message": "키워드 삭제됨"}


@app.get("/api/keywords/{keyword_id}/boards")
def get_keyword_boards(keyword_id: int):
    return db.get_keyword_boards(keyword_id)


@app.put("/api/keywords/{keyword_id}/boards")
def set_keyword_boards(keyword_id: int, req: KeywordBoardMapping):
    db.set_keyword_boards(keyword_id, req.board_ids)
    return {"message": "키워드-게시판 매핑 업데이트됨"}


@app.get("/api/keywords/{keyword_id}/comments")
def get_keyword_comments(keyword_id: int):
    return db.get_keyword_comments(keyword_id)


@app.put("/api/keywords/{keyword_id}/comments")
def set_keyword_comments(keyword_id: int, req: KeywordCommentMapping):
    db.set_keyword_comments(keyword_id, req.template_ids)
    return {"message": "키워드-댓글 템플릿 매핑 업데이트됨"}


# ─── Comment Templates API ────────────────────────────────

@app.get("/api/comments/templates")
def list_comment_templates():
    return db.get_comment_templates()


@app.post("/api/comments/templates")
def create_comment_template(req: CommentTemplateCreate):
    if not req.text.strip():
        raise HTTPException(400, "댓글 문구를 입력하세요.")
    cid = db.add_comment_template(req.text.strip())
    return {"id": cid, "message": "댓글 템플릿 등록 완료"}


@app.put("/api/comments/templates/{template_id}/toggle")
def toggle_comment_template(template_id: int):
    db.toggle_comment_template(template_id)
    return {"message": "댓글 템플릿 상태 변경됨"}


@app.delete("/api/comments/templates/{template_id}")
def delete_comment_template(template_id: int):
    db.delete_comment_template(template_id)
    return {"message": "댓글 템플릿 삭제됨"}


# ─── Seed Reset API ──────────────────────────────────────

@app.post("/api/seed/reset")
def reset_seed():
    """키워드·댓글을 모두 삭제하고 초기화"""
    from seed_data import reseed as reseed_db
    conn = db.get_connection()
    try:
        reseed_db(conn)
    finally:
        conn.close()
    return {"message": "데이터 일괄 삭제 초기화 완료"}


# ─── Schedule API ──────────────────────────────────────────

@app.get("/api/schedule")
def get_schedule():
    config = db.get_schedule_config()
    config["is_running"] = sched.is_running()
    return config


@app.put("/api/schedule")
async def update_schedule(req: ScheduleConfigUpdate):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if updates:
        db.update_schedule_config(**updates)
        await sched.reload_scheduler()
    return {"message": "스케줄 설정 업데이트됨"}


# ─── Scheduler Control ────────────────────────────────────

@app.post("/api/scheduler/start")
async def start_scheduler():
    await sched.start_scheduler()
    return {"message": "스케줄러 시작됨", "running": True}


@app.post("/api/scheduler/stop")
async def stop_scheduler():
    await sched.stop_scheduler()
    return {"message": "스케줄러 중지됨", "running": False}


@app.post("/api/scheduler/run-once")
async def run_once(cafe_group_id: int = None):
    """즉시 1회 발행 (수동 테스트) — cafe_group_id 지정 시 해당 카페만 대상"""
    asyncio.create_task(sched.run_once_now(cafe_group_id=cafe_group_id))
    return {"message": "1회 발행 작업이 시작되었습니다"}


@app.get("/api/scheduler/jobs")
def get_scheduler_jobs():
    """등록된 APScheduler 잡 목록 및 다음 실행 시간 확인"""
    jobs = []
    for job in sched.scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": str(job.next_run_time) if job.next_run_time else None,
            "trigger": str(job.trigger),
        })
    config = db.get_schedule_config()
    return {
        "jobs": jobs,
        "config": {
            "base_start_hour": config.get("base_start_hour"),
            "base_start_minute": config.get("base_start_minute"),
            "daily_shift_minutes": config.get("daily_shift_minutes"),
            "is_running": sched.is_running(),
        }
    }


# ─── History API ───────────────────────────────────────────

@app.get("/api/history")
def get_history(limit: int = 50):
    records = db.get_publish_history(limit)
    # 각 발행 기록에 댓글 정보 추가
    for record in records:
        record["comments"] = db.get_comments_for_publish(record["id"])
    return records


# ─── SSE: 실시간 상태 스트림 ───────────────────────────────

@app.get("/api/events")
async def event_stream():
    """SSE 엔드포인트 - 스케줄러 진행 상태 실시간 수신"""
    async def generate():
        queue = asyncio.Queue()

        async def callback(event, data):
            await queue.put((event, data))

        sched.register_progress_callback(callback)

        try:
            # 연결 확인 이벤트
            yield f"event: connected\ndata: {json.dumps({'message': 'SSE 연결됨'})}\n\n"

            while True:
                try:
                    event, data = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    # 30초마다 keep-alive
                    yield f"event: ping\ndata: {json.dumps({'ts': __import__('time').time()})}\n\n"
        finally:
            sched.unregister_progress_callback(callback)

    return StreamingResponse(generate(), media_type="text/event-stream")


# ─── 통계 API ─────────────────────────────────────────────

@app.get("/api/stats")
def get_stats():
    history = db.get_publish_history(1000)
    total_posts = len(history)
    success_posts = sum(1 for h in history if h["status"] == "성공")
    failed_posts = sum(1 for h in history if h["status"] == "실패")

    total_comments = 0
    success_comments = 0
    failed_comments = 0
    for record in history:
        comments = db.get_comments_for_publish(record["id"])
        total_comments += len(comments)
        success_comments += sum(1 for c in comments if c["status"] == "성공")
        failed_comments += sum(1 for c in comments if c["status"] == "실패")

    return {
        "total_posts": total_posts,
        "success_posts": success_posts,
        "failed_posts": failed_posts,
        "total_comments": total_comments,
        "success_comments": success_comments,
        "failed_comments": failed_comments,
    }


# ─── Telegram API ─────────────────────────────────────────

@app.get("/api/telegram")
def get_telegram_config():
    try:
        config = tg.get_telegram_config()
        # 봇 토큰 마스킹 (앞 5자만 표시)
        token = config.get("bot_token", "")
        if token and len(token) > 5:
            config["bot_token_masked"] = token[:5] + "••••••••"
        else:
            config["bot_token_masked"] = ""
        config.pop("bot_token", None)
        return config
    except Exception as e:
        logger.error(f"텔레그램 설정 조회 실패: {e}", exc_info=True)
        raise HTTPException(500, f"텔레그램 설정 조회 실패: {e}")


@app.put("/api/telegram")
def update_telegram_config(req: TelegramConfigUpdate):
    try:
        updates = {k: v for k, v in req.model_dump().items() if v is not None}
        if updates:
            tg.update_telegram_config(**updates)
        return {"message": "텔레그램 설정 업데이트됨"}
    except Exception as e:
        logger.error(f"텔레그램 설정 저장 실패: {e}", exc_info=True)
        raise HTTPException(500, f"텔레그램 설정 저장 실패: {e}")


@app.post("/api/telegram/test")
async def test_telegram():
    result = await tg.send_test_message()
    if result.get("ok"):
        return {"message": "테스트 메시지 전송 성공"}
    raise HTTPException(400, f"전송 실패: {result.get('error')}")


# ─── Proxy API ─────────────────────────────────────────────

@app.get("/api/proxy/status")
def get_proxy_status():
    """계정별 프록시 설정 상태 조회"""
    accounts = db.get_accounts()
    result = []
    for acc in accounts:
        has_proxy = bool(acc.get("proxy_server"))
        proxy_display = None
        if has_proxy:
            proxy = db.get_account_proxy(acc["id"])
            proxy_display = _mask_proxy_server(proxy["server"]) if proxy else "프록시 설정됨"
        result.append({
            "account_id": acc["id"],
            "account_name": acc["username"],
            "proxy_connected": has_proxy,
            "proxy_source": "db" if has_proxy else None,
            "proxy_server": proxy_display,
        })
    return result


@app.get("/api/accounts/{account_id}/proxy")
def get_account_proxy(account_id: int):
    """계정 프록시 정보 조회 (서버 주소 표시, 비밀번호 마스킹)"""
    proxy = db.get_account_proxy(account_id)
    if not proxy:
        return {"has_proxy": False}
    return {
        "has_proxy": True,
        "server": proxy["server"],
        "username": proxy["username"] or "",
        "has_password": bool(proxy["password"]),
    }


@app.put("/api/accounts/{account_id}/proxy")
def set_account_proxy(account_id: int, req: dict):
    """계정 프록시 설정 (AES-256 암호화 저장)"""
    server = req.get("server", "").strip()
    if not server:
        raise HTTPException(400, "프록시 서버 주소를 입력하세요.")
    username = req.get("username", "").strip()
    password = req.get("password", "").strip()
    # 비밀번호가 빈 문자열이면 기존 비밀번호 유지
    if not password:
        existing = db.get_account_proxy(account_id)
        if existing and existing.get("password"):
            password = existing["password"]
    db.update_account_proxy(account_id, server, username, password)
    return {"message": "프록시가 설정되었습니다.", "account_id": account_id}


@app.delete("/api/accounts/{account_id}/proxy")
def remove_account_proxy(account_id: int):
    """계정 프록시 제거"""
    db.delete_account_proxy(account_id)
    return {"message": "프록시가 제거되었습니다.", "account_id": account_id}


@app.get("/api/proxy/test/{account_id}")
async def test_proxy_connection(account_id: int):
    """계정별 프록시 연결 테스트 (IP 확인) - Playwright/httpx 기반"""
    proxy = db.get_account_proxy(account_id)
    if not proxy:
        return {"success": False, "account_id": account_id, "error": "프록시 설정 없음"}

    try:
        import httpx
        proxy_url = proxy["server"]
        if proxy.get("username") and proxy.get("password"):
            # scheme 분리 후 인증 정보 삽입
            scheme, rest = (proxy_url.split("://", 1) if "://" in proxy_url else ("http", proxy_url))
            proxy_url = f"{scheme}://{proxy['username']}:{proxy['password']}@{rest}"

        async with httpx.AsyncClient(proxy=proxy_url, timeout=10) as client:
            resp = await client.get("https://api.ipify.org?format=json")
            ip_data = resp.json()
            return {
                "success": True,
                "account_id": account_id,
                "proxy_ip": ip_data.get("ip", ""),
                "proxy_server": proxy["server"],
            }
    except Exception as e:
        return {"success": False, "account_id": account_id, "error": str(e)}


# ─── Claude API 설정 ──────────────────────────────────────

@app.get("/api/api-config")
def get_api_config():
    """Claude API 설정 조회 (키 마스킹)"""
    try:
        conn = db.get_connection()
        row = conn.execute("SELECT * FROM api_config WHERE id = 1").fetchone()
        conn.close()
        if not row:
            return {"api_key_masked": "", "captcha_auto_solve": 1}
        config = dict(row)
        key = config.get("api_key", "")
        if key and len(key) > 8:
            config["api_key_masked"] = key[:8] + "••••••••" + key[-4:]
        else:
            config["api_key_masked"] = ""
        config.pop("api_key", None)
        return config
    except Exception as e:
        logger.error(f"API 설정 조회 실패: {e}", exc_info=True)
        raise HTTPException(500, f"API 설정 조회 실패: {e}")


@app.put("/api/api-config")
def update_api_config(req: dict):
    """Claude API 설정 업데이트"""
    try:
        conn = db.get_connection()
        conn.execute("INSERT OR IGNORE INTO api_config (id) VALUES (1)")
        updates = {}
        if "api_key" in req and req["api_key"]:
            updates["api_key"] = req["api_key"].strip()
        if "captcha_auto_solve" in req:
            updates["captcha_auto_solve"] = int(req["captcha_auto_solve"])
        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE api_config SET {set_clause} WHERE id = 1",
                list(updates.values())
            )
        conn.commit()
        conn.close()
        return {"message": "API 설정이 저장되었습니다."}
    except Exception as e:
        logger.error(f"API 설정 저장 실패: {e}", exc_info=True)
        raise HTTPException(500, f"API 설정 저장 실패: {e}")


@app.delete("/api/api-config/key")
def delete_api_key():
    """Claude API 키 삭제"""
    try:
        conn = db.get_connection()
        conn.execute("UPDATE api_config SET api_key = '' WHERE id = 1")
        conn.commit()
        conn.close()
        return {"message": "API 키가 삭제되었습니다."}
    except Exception as e:
        logger.error(f"API 키 삭제 실패: {e}", exc_info=True)
        raise HTTPException(500, f"API 키 삭제 실패: {e}")


# ─── Health ────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "scheduler_running": sched.is_running()}


# ─── 실행 ─────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    log_config = uvicorn.config.LOGGING_CONFIG
    # uvicorn 기본 로그 설정에 cafe_publisher/scheduler 로거 추가
    log_config["loggers"]["cafe_publisher"] = {
        "handlers": ["default"],
        "level": "DEBUG",
        "propagate": False,
    }
    log_config["loggers"]["scheduler"] = {
        "handlers": ["default"],
        "level": "DEBUG",
        "propagate": False,
    }
    # 핸들러 포맷을 상세 포맷으로 변경
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False, log_config=log_config)
