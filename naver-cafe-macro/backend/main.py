"""
main.py - FastAPI 서버
네이버 카페 자동 발행 시스템 API + SSE 실시간 상태 전송
"""

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

# ─── 로깅 ─────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

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
    logger.info("DB 초기화 완료")


@app.get("/")
async def serve_frontend():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# ─── Request/Response Models ──────────────────────────────

class AccountCreate(BaseModel):
    username: str
    password: str

class CafeBoardCreate(BaseModel):
    cafe_url: str
    board_name: str
    menu_id: Optional[str] = ""

class KeywordCreate(BaseModel):
    text: str

class CommentTemplateCreate(BaseModel):
    text: str

class KeywordBoardMapping(BaseModel):
    board_ids: list[int]

class KeywordCommentMapping(BaseModel):
    template_ids: list[int]

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


# ─── Accounts API ──────────────────────────────────────────

@app.get("/api/accounts")
async def list_accounts():
    accounts = db.get_accounts()
    # 비밀번호 필드는 마스킹
    for acc in accounts:
        acc["password_enc"] = "••••••••"
    return accounts


@app.post("/api/accounts")
async def create_account(req: AccountCreate):
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
async def toggle_account(account_id: int):
    db.toggle_account(account_id)
    return {"message": "계정 상태 변경됨"}


@app.delete("/api/accounts/{account_id}")
async def delete_account(account_id: int):
    try:
        db.delete_account(account_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"계정 삭제 실패: {e}")
    return {"message": "계정 삭제됨"}


# ─── Cafe Boards API ──────────────────────────────────────

@app.get("/api/boards")
async def list_boards():
    return db.get_cafe_boards()


@app.post("/api/boards")
async def create_board(req: CafeBoardCreate):
    if not req.cafe_url.strip() or not req.board_name.strip():
        raise HTTPException(400, "카페 ID와 게시판 이름을 입력하세요.")
    bid = db.add_cafe_board(req.cafe_url.strip(), req.board_name.strip(), (req.menu_id or "").strip())
    return {"id": bid, "message": "게시판 등록 완료"}


@app.delete("/api/boards/{board_id}")
async def delete_board(board_id: int):
    db.delete_cafe_board(board_id)
    return {"message": "게시판 삭제됨"}


# ─── Keywords API ──────────────────────────────────────────

@app.get("/api/keywords")
async def list_keywords():
    return db.get_keywords()


@app.post("/api/keywords")
async def create_keyword(req: KeywordCreate):
    if not req.text.strip():
        raise HTTPException(400, "키워드를 입력하세요.")
    try:
        kid = db.add_keyword(req.text.strip())
        return {"id": kid, "message": "키워드 등록 완료"}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(400, "이미 등록된 키워드입니다.")
        raise HTTPException(500, str(e))


@app.delete("/api/keywords/{keyword_id}")
async def delete_keyword(keyword_id: int):
    db.delete_keyword(keyword_id)
    return {"message": "키워드 삭제됨"}


@app.get("/api/keywords/{keyword_id}/boards")
async def get_keyword_boards(keyword_id: int):
    return db.get_keyword_boards(keyword_id)


@app.put("/api/keywords/{keyword_id}/boards")
async def set_keyword_boards(keyword_id: int, req: KeywordBoardMapping):
    db.set_keyword_boards(keyword_id, req.board_ids)
    return {"message": "키워드-게시판 매핑 업데이트됨"}


@app.get("/api/keywords/{keyword_id}/comments")
async def get_keyword_comments(keyword_id: int):
    return db.get_keyword_comments(keyword_id)


@app.put("/api/keywords/{keyword_id}/comments")
async def set_keyword_comments(keyword_id: int, req: KeywordCommentMapping):
    db.set_keyword_comments(keyword_id, req.template_ids)
    return {"message": "키워드-댓글 템플릿 매핑 업데이트됨"}


# ─── Comment Templates API ────────────────────────────────

@app.get("/api/comments/templates")
async def list_comment_templates():
    return db.get_comment_templates()


@app.post("/api/comments/templates")
async def create_comment_template(req: CommentTemplateCreate):
    if not req.text.strip():
        raise HTTPException(400, "댓글 문구를 입력하세요.")
    cid = db.add_comment_template(req.text.strip())
    return {"id": cid, "message": "댓글 템플릿 등록 완료"}


@app.put("/api/comments/templates/{template_id}/toggle")
async def toggle_comment_template(template_id: int):
    db.toggle_comment_template(template_id)
    return {"message": "댓글 템플릿 상태 변경됨"}


@app.delete("/api/comments/templates/{template_id}")
async def delete_comment_template(template_id: int):
    db.delete_comment_template(template_id)
    return {"message": "댓글 템플릿 삭제됨"}


# ─── Seed Reset API ──────────────────────────────────────

@app.post("/api/seed/reset")
async def reset_seed():
    """키워드·댓글을 시드 데이터(300개 키워드)로 초기화"""
    from seed_data import reseed as reseed_db
    conn = db.get_connection()
    try:
        reseed_db(conn)
    finally:
        conn.close()
    return {"message": "시드 데이터 초기화 완료 (300개 키워드, 102개 댓글)"}


# ─── Schedule API ──────────────────────────────────────────

@app.get("/api/schedule")
async def get_schedule():
    config = db.get_schedule_config()
    config["is_running"] = sched.is_running()
    return config


@app.put("/api/schedule")
async def update_schedule(req: ScheduleConfigUpdate):
    updates = {k: v for k, v in req.dict().items() if v is not None}
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
async def run_once():
    """즉시 1회 발행 (수동 테스트)"""
    asyncio.create_task(sched.run_once_now())
    return {"message": "1회 발행 작업이 시작되었습니다"}


# ─── History API ───────────────────────────────────────────

@app.get("/api/history")
async def get_history(limit: int = 50):
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
async def get_stats():
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


# ─── Health ────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "scheduler_running": sched.is_running()}


# ─── 실행 ─────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
