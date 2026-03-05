"""
FastAPI 서버 - 네이버 블로그 자동 발행 시스템
SSE(Server-Sent Events)로 진행 상태를 실시간 전송합니다.
"""

import os
import sys
import json
import asyncio
import csv
import io
import logging
import random
from pathlib import Path
from datetime import datetime, timedelta

# .env 파일 직접 파싱 (Windows에서 load_dotenv 미동작 문제 해결)
def _load_env_file(env_path):
    """load_dotenv 없이 .env 파일을 직접 읽어 환경변수에 설정"""
    env_path = Path(env_path)
    # .env 파일이 없으면 .env.example에서 자동 복사
    if not env_path.exists():
        example = env_path.parent / ".env.example"
        if example.exists():
            import shutil
            shutil.copy(example, env_path)
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
                        os.environ.setdefault(key, value)
    except FileNotFoundError:
        pass

_load_env_file(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List

from agents import _call_claude
from prompts import DOC_TUTORIAL_PROMPT, DOC_REVIEW_PROMPT, DOC_ANALYSIS_PROMPT
import database as db
from crypto import encrypt, decrypt
from image_generator import generate_keyword_image, generate_keyword_image_variants

# ─── 로깅 설정 ──────────────────────────────────────────
LOG_DIR = Path(__file__).resolve().parent.parent / "data" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_DIR / "server.log"), encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("main")

# ─── 기본 하단 링크 설정 ───────────────────────────────────
DEFAULT_FOOTER_LINK = os.getenv("DEFAULT_FOOTER_LINK", "")
DEFAULT_FOOTER_LINK_TEXT = os.getenv("DEFAULT_FOOTER_LINK_TEXT", "")

# ─── FastAPI 앱 ──────────────────────────────────────────

app = FastAPI(title="DailyFNI - 네이버 블로그 자동 발행 시스템")

# asyncio.create_task 참조 보관 (GC 방지)
_background_tasks: set = set()


def _on_task_done(task):
    """background task 완료/실패 시 콘솔 출력"""
    _background_tasks.discard(task)
    try:
        if task.cancelled():
            print(f"[TASK] 취소됨", flush=True)
            logger.warning("[TASK] background task 취소됨")
        elif task.exception():
            exc = task.exception()
            print(f"[TASK] 오류 발생: {exc}", flush=True)
            logger.error(f"[TASK] background task 오류: {exc}", exc_info=exc)
        else:
            print(f"[TASK] 정상 완료", flush=True)
            logger.info("[TASK] background task 정상 완료")
    except Exception as e:
        print(f"[TASK] done callback 오류: {e}", flush=True)


# ─── 422 에러 상세 로그 핸들러 ──────────────────────────────
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = None
    try:
        body = await request.body()
        body = body.decode("utf-8")[:500]
    except Exception:
        pass
    logger.error(f"422 Validation Error on {request.method} {request.url.path}")
    logger.error(f"  Request body: {body}")
    logger.error(f"  Errors: {exc.errors()}")
    # 사용자에게 상세 에러 메시지 반환
    messages = []
    for err in exc.errors():
        loc = " > ".join(str(x) for x in err.get("loc", []))
        messages.append(f"{loc}: {err.get('msg', '')}")
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(messages) if messages else "입력값 검증 실패"},
    )


# ─── CORS 미들웨어 ──────────────────────────────────────────
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


# ─── 보안 헤더 미들웨어 ──────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ─── 간단 Rate Limiter (IP 기반, 인메모리) ──────────────────
_rate_limit_store: dict = {}  # {ip: [timestamp, ...]}
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "30"))  # 분당 최대 요청
RATE_LIMIT_WINDOW = 60  # 초


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        client_ip = request.client.host if request.client else "unknown"
        now = datetime.now().timestamp()
        # 만료된 기록 정리
        if client_ip in _rate_limit_store:
            _rate_limit_store[client_ip] = [
                t for t in _rate_limit_store[client_ip] if now - t < RATE_LIMIT_WINDOW
            ]
        else:
            _rate_limit_store[client_ip] = []
        if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
            )
        _rate_limit_store[client_ip].append(now)
    return await call_next(request)


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.on_event("startup")
async def startup():
    print("=== DailyFNI v2026-03-01-B ===", flush=True)
    try:
        await db.init_db()
        logger.info("데이터베이스 초기화 완료")
    except Exception as e:
        logger.error(f"데이터베이스 연결 실패: {e}")
        logger.error("MySQL이 실행 중인지, .env 파일의 DB 설정이 올바른지 확인하세요.")
        logger.error(f"  MYSQL_HOST={os.getenv('MYSQL_HOST', '127.0.0.1')}")
        logger.error(f"  MYSQL_PORT={os.getenv('MYSQL_PORT', '3306')}")
        logger.error(f"  MYSQL_USER={os.getenv('MYSQL_USER', 'root')}")
        logger.error(f"  MYSQL_DB={os.getenv('MYSQL_DB', 'dailyfni')}")
        return  # DB 없이도 서버는 기동 (API 호출 시 에러 반환)
    # 스케줄러 자동 시작
    try:
        config = await db.get_scheduler_config()
        if config.get("is_active"):
            from scheduler import start_scheduler
            await start_scheduler()
            logger.info("스케줄러 자동 시작")
    except Exception as e:
        logger.warning(f"스케줄러 시작 실패: {e}")


@app.on_event("shutdown")
async def shutdown():
    """Graceful shutdown: DB 풀 정리, 스케줄러 중지"""
    logger.info("서버 종료 중...")
    try:
        from scheduler import stop_scheduler
        await stop_scheduler()
    except Exception:
        pass
    try:
        await db.close_pool()
    except Exception:
        pass
    logger.info("서버 종료 완료")


# ─── Pydantic 모델 ──────────────────────────────────────

# ─── 공통 검증 함수 ──────────────────────────────────────
def _validate_max_length(value: str, max_len: int, field_name: str) -> str:
    if value and len(value) > max_len:
        raise ValueError(f"{field_name}은(는) {max_len}자 이하여야 합니다.")
    return value


def _validate_api_key(v: str) -> str:
    if not v or len(v) < 20:
        raise ValueError("유효한 API 키를 입력하세요 (20자 이상).")
    return v


def _validate_priority(v: str) -> str:
    if v not in ("ad", "general"):
        raise ValueError("priority는 ad, general 중 하나여야 합니다.")
    return v


class AccountCreate(BaseModel):
    account_name: str
    naver_id: str
    naver_password: str
    specialty: str = ""

    @validator("account_name")
    def check_name(cls, v):
        return _validate_max_length(v.strip(), 100, "계정 이름")

    @validator("naver_id")
    def check_id(cls, v):
        return _validate_max_length(v.strip(), 100, "네이버 ID")

    @validator("naver_password")
    def check_pw(cls, v):
        return _validate_max_length(v, 200, "비밀번호")

    @validator("specialty")
    def check_spec(cls, v):
        return _validate_max_length(v, 500, "전문분야")


class AccountUpdate(BaseModel):
    account_name: Optional[str] = None
    naver_id: Optional[str] = None
    naver_password: Optional[str] = None
    specialty: Optional[str] = None
    is_active: Optional[int] = None

    @validator("is_active")
    def check_active(cls, v):
        if v is not None and v not in (0, 1):
            raise ValueError("is_active는 0 또는 1이어야 합니다.")
        return v


class CategoryCreate(BaseModel):
    account_id: int
    category_name: str
    is_default: bool = False

    @validator("category_name")
    def check_name(cls, v):
        return _validate_max_length(v.strip(), 100, "카테고리 이름")


class CategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    is_default: Optional[bool] = None


class PublishRequest(BaseModel):
    api_key: str
    keyword: str
    documents: List[dict]  # [{title, content, format, account_id, category_id, keywords}]
    footer_link: Optional[str] = None  # 블로그 하단에 삽입할 링크 URL
    footer_link_text: Optional[str] = None  # 링크 표시 텍스트 (없으면 URL 그대로)

    @validator("api_key")
    def check_api_key(cls, v):
        return _validate_api_key(v)

    @validator("documents")
    def check_docs(cls, v):
        if len(v) > 10:
            raise ValueError("한 번에 최대 10개 문서만 발행할 수 있습니다.")
        return v

    @validator("footer_link")
    def check_footer_link(cls, v):
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("링크는 http:// 또는 https://로 시작해야 합니다.")
        return _validate_max_length(v, 500, "하단 링크") if v else v

    @validator("footer_link_text")
    def check_footer_link_text(cls, v):
        return _validate_max_length(v, 100, "링크 텍스트") if v else v


class KeywordCreate(BaseModel):
    keyword: str
    product_info: str = ""
    priority: str = "ad"

    @validator("keyword")
    def check_keyword(cls, v):
        return _validate_max_length(v.strip(), 200, "키워드")

    @validator("priority")
    def check_priority(cls, v):
        return _validate_priority(v)


class KeywordBulkCreate(BaseModel):
    keywords: List[str]
    product_info: str = ""
    priority: str = "ad"

    @validator("keywords")
    def check_keywords(cls, v):
        if len(v) > 500:
            raise ValueError("한 번에 최대 500개 키워드만 등록할 수 있습니다.")
        return v

    @validator("priority")
    def check_priority(cls, v):
        return _validate_priority(v)


class KeywordUpdate(BaseModel):
    keyword: Optional[str] = None
    product_info: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None

    @validator("priority")
    def check_priority(cls, v):
        if v is not None:
            return _validate_priority(v)
        return v

    @validator("status")
    def check_status(cls, v):
        if v is not None and v not in ("pending", "used", "paused"):
            raise ValueError("status는 pending, used, paused 중 하나여야 합니다.")
        return v


class SchedulerConfigUpdate(BaseModel):
    is_active: Optional[int] = None
    start_hour: Optional[int] = None
    start_minute: Optional[int] = None
    end_hour: Optional[int] = None
    end_minute: Optional[int] = None
    days_of_week: Optional[List[int]] = None
    min_interval_hours: Optional[int] = None
    max_interval_hours: Optional[int] = None
    random_rest_enabled: Optional[int] = None
    random_rest_percent: Optional[int] = None
    weekend_low_prob: Optional[int] = None
    weekend_prob_percent: Optional[int] = None
    force_rest_after_days: Optional[int] = None
    engagement_enabled: Optional[int] = None
    engagement_hour: Optional[int] = None
    engagement_minute: Optional[int] = None
    engagement_max_posts: Optional[int] = None
    engagement_do_like: Optional[int] = None
    engagement_do_comment: Optional[int] = None
    engagement_account_ids: Optional[List[int]] = None
    footer_link: Optional[str] = None
    footer_link_text: Optional[str] = None

    @validator("footer_link")
    def check_footer_link(cls, v):
        if v is not None and v != "" and not v.startswith(("http://", "https://")):
            raise ValueError("링크는 http:// 또는 https://로 시작해야 합니다.")
        return v

    @validator("start_hour", "end_hour")
    def check_hour(cls, v):
        if v is not None and not (0 <= v <= 23):
            raise ValueError("시간은 0~23 사이여야 합니다.")
        return v

    @validator("start_minute", "end_minute")
    def check_minute(cls, v):
        if v is not None and not (0 <= v <= 59):
            raise ValueError("분은 0~59 사이여야 합니다.")
        return v

    @validator("days_of_week")
    def check_days(cls, v):
        if v is not None:
            if not all(1 <= d <= 7 for d in v):
                raise ValueError("요일은 1(월)~7(일) 사이여야 합니다.")
        return v


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 프론트엔드 서빙
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/")
async def serve_frontend():
    response = FileResponse(str(FRONTEND_DIR / "index.html"))
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 글 사전 생성 API (키워드 큐 → 3개 글 생성 후 DB 저장)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/articles/generate-batch")
async def generate_batch():
    """키워드 큐에서 다음 키워드를 가져와 3개 글을 생성하고 DB에 저장"""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")

    kw = await db.get_next_keyword()
    if not kw:
        raise HTTPException(status_code=404, detail="발행할 키워드가 없습니다. 키워드를 추가해주세요.")

    print(f"[generate-batch] 키워드 '{kw['keyword']}' 생성 task 시작", flush=True)
    logger.info(f"[generate-batch] 키워드 '{kw['keyword']}' 생성 task 시작")
    from scheduler import article_generation_job
    task = asyncio.create_task(article_generation_job(manual=True))
    _background_tasks.add(task)
    task.add_done_callback(_on_task_done)
    print(f"[generate-batch] task 생성 완료, 현재 background tasks: {len(_background_tasks)}개", flush=True)
    return {"message": f"글 생성이 시작되었습니다. 키워드: {kw['keyword']}", "keyword": kw["keyword"]}


@app.get("/api/articles/generated")
async def get_generated_articles():
    """사전 생성된 글 목록 조회 (발행 대기 중)"""
    articles = await db.get_all_generated_articles()
    return articles


@app.get("/api/articles/ready-batches")
async def get_ready_batches():
    """발행 대기 중인 배치 목록"""
    batches = await db.get_ready_batches()
    return batches


@app.post("/api/articles/publish-now")
async def publish_ready_articles():
    """사전 생성된 글을 즉시 발행 시작"""
    batches = await db.get_ready_batches()
    if not batches:
        raise HTTPException(status_code=404, detail="발행할 사전 생성 글이 없습니다.")

    from scheduler import daily_publish_job
    task = asyncio.create_task(daily_publish_job(manual=True))
    _background_tasks.add(task)
    task.add_done_callback(_on_task_done)
    return {"message": f"{len(batches)}개 배치의 글 발행이 시작되었습니다.", "batch_count": len(batches)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 계정 관리 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/accounts")
async def create_account(req: AccountCreate):
    """계정 추가 (ID/PW AES-256 암호화 저장)"""
    try:
        encrypted_id = encrypt(req.naver_id)
        encrypted_pw = encrypt(req.naver_password)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    account = await db.create_account({
        "account_name": req.account_name,
        "naver_id": encrypted_id,
        "naver_password": encrypted_pw,
        "specialty": req.specialty,
    })
    # 응답에서 암호화된 비밀번호는 마스킹
    account["naver_id"] = "***암호화됨***"
    account["naver_password"] = "***암호화됨***"
    return account


@app.get("/api/accounts")
async def get_accounts():
    """계정 목록"""
    accounts = await db.get_accounts()
    for a in accounts:
        a["naver_id"] = "***암호화됨***"
        a["naver_password"] = "***암호화됨***"
    return accounts


@app.put("/api/accounts/{account_id}")
async def update_account(account_id: int, req: AccountUpdate):
    """계정 수정"""
    data = {}
    if req.account_name is not None:
        data["account_name"] = req.account_name
    if req.naver_id is not None:
        data["naver_id"] = encrypt(req.naver_id)
    if req.naver_password is not None:
        data["naver_password"] = encrypt(req.naver_password)
    if req.specialty is not None:
        data["specialty"] = req.specialty
    if req.is_active is not None:
        data["is_active"] = req.is_active

    account = await db.update_account(account_id, data)
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    account["naver_id"] = "***암호화됨***"
    account["naver_password"] = "***암호화됨***"
    return account


@app.delete("/api/accounts/{account_id}")
async def delete_account(account_id: int):
    """계정 삭제"""
    deleted = await db.delete_account(account_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    return {"message": "계정이 삭제되었습니다."}


@app.get("/api/accounts/{account_id}/test-login")
async def test_account_login(account_id: int):
    """로그인 테스트"""
    account = await db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    try:
        naver_id = decrypt(account["naver_id"])
        naver_pw = decrypt(account["naver_password"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"복호화 실패: {e}")

    from publisher import test_login
    result = await test_login(account_id, naver_id, naver_pw)
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 카테고리 관리 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/categories")
async def create_category(req: CategoryCreate):
    return await db.create_category({
        "account_id": req.account_id,
        "category_name": req.category_name,
        "is_default": req.is_default,
    })


@app.get("/api/categories/{account_id}")
async def get_categories(account_id: int):
    return await db.get_categories(account_id)


@app.put("/api/categories/{cat_id}")
async def update_category(cat_id: int, req: CategoryUpdate):
    data = {}
    if req.category_name is not None:
        data["category_name"] = req.category_name
    if req.is_default is not None:
        data["is_default"] = 1 if req.is_default else 0
    result = await db.update_category(cat_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다.")
    return result


@app.delete("/api/categories/{cat_id}")
async def delete_category(cat_id: int):
    deleted = await db.delete_category(cat_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다.")
    return {"message": "카테고리가 삭제되었습니다."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 발행 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 발행 상태 추적 (메모리, TTL 관리)
_publish_status = {}
_publish_status_timestamps = {}
_PUBLISH_STATUS_TTL = 3600  # 1시간 후 자동 정리


def _cleanup_publish_status():
    """만료된 발행 상태 엔트리 정리"""
    now = datetime.now().timestamp()
    expired = [k for k, t in _publish_status_timestamps.items() if now - t > _PUBLISH_STATUS_TTL]
    for k in expired:
        _publish_status.pop(k, None)
        _publish_status_timestamps.pop(k, None)


async def _run_publish_batch(batch_id: int, keyword: str, documents: list, api_key: str, footer_link: str = "", footer_link_text: str = ""):
    """백그라운드에서 3개 문서를 순차 발행"""
    from publisher import run_publish_task

    # footer_link 미지정 시 DB 설정 → 환경변수 순으로 폴백
    if not footer_link or not footer_link_text:
        try:
            sched_cfg = await db.get_scheduler_config()
            if not footer_link:
                footer_link = sched_cfg.get("footer_link", "") or DEFAULT_FOOTER_LINK
            if not footer_link_text:
                footer_link_text = sched_cfg.get("footer_link_text", "") or DEFAULT_FOOTER_LINK_TEXT
        except Exception:
            if not footer_link:
                footer_link = DEFAULT_FOOTER_LINK
            if not footer_link_text:
                footer_link_text = DEFAULT_FOOTER_LINK_TEXT

    _cleanup_publish_status()
    _publish_status[batch_id] = {
        "status": "publishing",
        "documents": [],
        "current": 0,
    }
    _publish_status_timestamps[batch_id] = datetime.now().timestamp()

    # 키워드 대표이미지 3개 생성 (색상 변형, 저품질 방지)
    keyword_image_paths = []
    try:
        keyword_image_paths = await asyncio.to_thread(generate_keyword_image_variants, keyword, 3)
        logger.info(f"키워드 대표이미지 {len(keyword_image_paths)}개 생성 완료")
    except Exception as e:
        logger.warning(f"키워드 대표이미지 생성 실패 (계속 진행): {e}")

    # 계정 자동 분배: 모든 문서가 같은 account_id면 활성 계정들에 순차 분배
    account_ids = [doc.get("account_id") for doc in documents]
    unique_accounts = set(aid for aid in account_ids if aid)
    if len(unique_accounts) <= 1 and len(documents) > 1:
        all_accounts = await db.get_accounts()
        active_accounts = [a for a in all_accounts if a.get("is_active")]
        if len(active_accounts) > 1:
            logger.info(f"계정 자동 분배: {len(documents)}개 문서 → {len(active_accounts)}개 활성 계정")
            for i, doc in enumerate(documents):
                assigned = active_accounts[i % len(active_accounts)]
                doc["account_id"] = assigned["id"]
                # 카테고리도 해당 계정의 기본 카테고리로 재설정
                try:
                    cats = await db.get_categories(assigned["id"])
                    default_cat = next((c for c in cats if c.get("is_default")), None)
                    if default_cat:
                        doc["category_id"] = default_cat["id"]
                except Exception:
                    pass
                logger.info(f"  문서 {i+1} → 계정: {assigned.get('account_name', assigned['id'])}")

    # 계정 교차 발행: 같은 계정 연속 방지 (저품질 방지)
    # [acc3, acc3, acc2, acc2, acc1, acc1] → [acc3, acc2, acc1, acc3, acc2, acc1]
    if len(documents) > 1:
        from collections import defaultdict
        groups = defaultdict(list)
        for doc in documents:
            groups[doc.get("account_id")].append(doc)
        if len(groups) > 1:
            reordered = []
            while any(groups.values()):
                for aid in sorted(groups.keys()):
                    if groups[aid]:
                        reordered.append(groups[aid].pop(0))
            documents = reordered
            logger.info(f"계정 교차 정렬: {' → '.join(str(d.get('account_id')) for d in documents)}")

    success_count = 0
    failed_count = 0

    for i, doc in enumerate(documents):
        _publish_status[batch_id]["current"] = i + 1
        account_id = doc.get("account_id")
        category_id = doc.get("category_id")

        if not account_id:
            continue

        # 계정 정보 가져오기
        account = await db.get_account(account_id)
        logger.info(f"문서 {i+1}/{len(documents)} 발행 시작: account_id={account_id}, 계정명={account.get('account_name', '?') if account else '미발견'}")
        if not account:
            failed_count += 1
            _publish_status[batch_id]["documents"].append({
                "document_number": i + 1,
                "status": "failed",
                "error": "계정을 찾을 수 없습니다.",
            })
            continue

        # 카테고리 이름
        cat_name = ""
        if category_id:
            cats = await db.get_categories(account_id)
            cat = next((c for c in cats if c["id"] == category_id), None)
            if cat:
                cat_name = cat["category_name"]

        # 발행 이력 생성
        history = await db.create_publish_history({
            "batch_id": batch_id,
            "document_number": i + 1,
            "account_id": account_id,
            "category_id": category_id,
            "title": doc.get("title", ""),
            "content": doc.get("content", ""),
            "keywords": doc.get("keywords", [keyword]),
            "document_format": doc.get("format", "tutorial"),
        })

        # 계정 간 딜레이 (첫 번째 제외, 저품질 방지를 위해 충분한 간격)
        if i > 0:
            delay = random.uniform(30, 90)
            logger.info(f"계정 간 딜레이: {delay:.0f}초 (저품질 방지)")
            await asyncio.sleep(delay)

        # 발행
        try:
            naver_id = decrypt(account["naver_id"])
            naver_pw = decrypt(account["naver_password"])
            tags = doc.get("keywords", [keyword])

            pub_result = await run_publish_task(
                account_id, naver_id, naver_pw,
                doc.get("title", ""), doc.get("content", ""),
                cat_name, tags,
                keyword_image_paths[i % len(keyword_image_paths)] if keyword_image_paths else "",
                footer_link, footer_link_text,
            )

            if pub_result["success"]:
                await db.update_publish_history(history["id"], {
                    "status": "success",
                    "naver_post_url": pub_result["url"],
                    "published_at": datetime.now().isoformat(),
                })
                await db.update_keyword_stats(keyword, account_id)
                success_count += 1
                _publish_status[batch_id]["documents"].append({
                    "document_number": i + 1,
                    "status": "success",
                    "url": pub_result["url"],
                })
            else:
                await db.update_publish_history(history["id"], {
                    "status": "failed",
                    "error_message": pub_result["error"],
                })
                failed_count += 1
                _publish_status[batch_id]["documents"].append({
                    "document_number": i + 1,
                    "status": "failed",
                    "error": pub_result["error"],
                })

        except Exception as e:
            await db.update_publish_history(history["id"], {
                "status": "failed",
                "error_message": str(e),
            })
            failed_count += 1
            _publish_status[batch_id]["documents"].append({
                "document_number": i + 1,
                "status": "failed",
                "error": str(e),
            })

    # 배치 상태 업데이트
    status = "all_success" if failed_count == 0 else ("all_failed" if success_count == 0 else "partial_success")
    await db.update_batch(batch_id, {
        "status": status,
        "success_count": success_count,
        "failed_count": failed_count,
    })

    _publish_status[batch_id]["status"] = "completed"
    _publish_status[batch_id]["result"] = {
        "status": status,
        "success_count": success_count,
        "failed_count": failed_count,
    }

    # 알림 생성
    await db.create_notification(
        "success" if status == "all_success" else "warning",
        f"발행 완료: {keyword}",
        f"성공: {success_count}개, 실패: {failed_count}개",
    )


@app.post("/api/publish/immediate")
async def publish_immediate(req: PublishRequest, background_tasks: BackgroundTasks):
    """즉시 발행 시작 (백그라운드 비동기)"""
    if not req.documents:
        raise HTTPException(status_code=400, detail="발행할 문서가 없습니다.")

    batch = await db.create_batch(req.keyword)
    background_tasks.add_task(
        _run_publish_batch, batch["id"], req.keyword, req.documents, req.api_key,
        req.footer_link or "", req.footer_link_text or "",
    )

    return {"batch_id": batch["id"], "message": "발행이 시작되었습니다.", "status": "publishing"}


@app.get("/api/publish/status/{batch_id}")
async def get_publish_status(batch_id: int):
    """발행 진행 상태 조회"""
    status = _publish_status.get(batch_id)
    if status:
        return status
    # DB에서 조회
    batch = await db.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    histories = await db.get_batch_history(batch_id)
    return {
        "status": batch["status"],
        "documents": [
            {
                "document_number": h["document_number"],
                "status": h["status"],
                "url": h.get("naver_post_url", ""),
                "error": h.get("error_message", ""),
                "account_name": h.get("account_name", ""),
            }
            for h in histories
        ],
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 배치 관리 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/batches")
async def get_batches(limit: int = 50, offset: int = 0):
    return await db.get_batches(limit, offset)


@app.get("/api/batches/{batch_id}")
async def get_batch(batch_id: int):
    batch = await db.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    histories = await db.get_batch_history(batch_id)
    return {"batch": batch, "documents": histories}


@app.post("/api/batches/{batch_id}/retry")
async def retry_batch(batch_id: int, background_tasks: BackgroundTasks):
    """실패한 문서만 재시도"""
    histories = await db.get_batch_history(batch_id)
    failed = [h for h in histories if h["status"] == "failed"]
    if not failed:
        return {"message": "재시도할 문서가 없습니다."}

    batch = await db.get_batch(batch_id)
    documents = [
        {
            "account_id": h["account_id"],
            "category_id": h["category_id"],
            "title": h["title"],
            "content": h["content"],
            "keywords": json.loads(h["keywords"]) if isinstance(h["keywords"], str) else h["keywords"],
            "format": h["document_format"],
        }
        for h in failed
    ]

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    background_tasks.add_task(_run_publish_batch, batch_id, batch["keyword"], documents, api_key)
    return {"message": f"{len(failed)}개 문서 재시도 시작"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 발행 이력 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/history")
async def get_history(
    account_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    filters = {
        "account_id": account_id,
        "batch_id": batch_id,
        "status": status,
        "keyword": keyword,
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
        "offset": offset,
    }
    return await db.get_publish_history({k: v for k, v in filters.items() if v is not None})


@app.get("/api/history/stats")
async def get_stats():
    """대시보드 통계 데이터"""
    return await db.get_dashboard_stats()


@app.get("/api/history/keywords")
async def get_keyword_stats(limit: int = 10):
    """키워드 통계 TOP N"""
    return await db.get_keyword_stats_top(limit)


@app.get("/api/history/export")
async def export_history(
    account_id: Optional[int] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """CSV 내보내기"""
    filters = {k: v for k, v in {
        "account_id": account_id, "status": status,
        "date_from": date_from, "date_to": date_to,
    }.items() if v is not None}

    data = await db.get_export_data(filters)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["날짜", "계정", "제목", "키워드", "카테고리", "상태", "URL"])
    for row in data:
        writer.writerow([
            row.get("published_at", row.get("created_at", "")),
            row.get("account_name", ""),
            row.get("title", ""),
            row.get("keywords", ""),
            row.get("category_name", ""),
            row.get("status", ""),
            row.get("naver_post_url", ""),
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=publish_history_{datetime.now().strftime('%Y%m%d')}.csv"},
    )


@app.post("/api/history/{history_id}/republish")
async def republish(history_id: int, background_tasks: BackgroundTasks):
    """재발행"""
    histories = await db.get_publish_history({"limit": 1000})
    history = next((h for h in histories if h["id"] == history_id), None)
    if not history:
        raise HTTPException(status_code=404, detail="이력을 찾을 수 없습니다.")

    batch = await db.create_batch(f"재발행: {history.get('title', '')[:20]}")
    documents = [{
        "account_id": history["account_id"],
        "category_id": history["category_id"],
        "title": history["title"],
        "content": history["content"],
        "keywords": json.loads(history["keywords"]) if isinstance(history["keywords"], str) else history["keywords"],
        "format": history["document_format"],
    }]
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    background_tasks.add_task(_run_publish_batch, batch["id"], history.get("title", ""), documents, api_key)
    return {"batch_id": batch["id"], "message": "재발행이 시작되었습니다."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 키워드 큐 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/keywords")
async def create_keyword(req: KeywordCreate):
    return await db.add_keyword({"keyword": req.keyword, "product_info": req.product_info, "priority": req.priority})


@app.post("/api/keywords/bulk")
async def create_keywords_bulk(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="잘못된 JSON 형식입니다.")

    logger.info(f"[일괄등록] 수신 데이터: {json.dumps(body, ensure_ascii=False)[:500]}")

    raw_keywords = body.get("keywords", [])
    product_info = body.get("product_info", "")
    priority = body.get("priority", "ad")

    if priority not in ("ad", "general"):
        priority = "ad"

    # keywords가 문자열 배열이든 객체 배열이든 모두 처리
    keywords = []
    for item in raw_keywords:
        if isinstance(item, str):
            kw = item.strip()
            pi = product_info
            pr = priority
        elif isinstance(item, dict):
            kw = item.get("keyword", "").strip()
            pi = item.get("product_info", product_info)
            pr = item.get("priority", priority)
        else:
            continue
        if kw:
            keywords.append({"keyword": kw, "product_info": pi, "priority": pr})

    if not keywords:
        raise HTTPException(status_code=400, detail="등록할 키워드가 없습니다.")
    if len(keywords) > 500:
        raise HTTPException(status_code=400, detail="한 번에 최대 500개 키워드만 등록할 수 있습니다.")

    count = await db.add_keywords_bulk(keywords)
    return {"message": f"{count}개 키워드가 등록되었습니다.", "count": count}


@app.get("/api/keywords")
async def get_keywords(status: Optional[str] = None):
    return await db.get_keywords(status)


@app.get("/api/keywords/next")
async def get_next_keyword():
    kw = await db.get_next_keyword()
    if not kw:
        return {"message": "사용 가능한 키워드가 없습니다.", "keyword": None}
    return kw


@app.put("/api/keywords/{kw_id}")
async def update_keyword_api(kw_id: int, req: KeywordUpdate):
    data = {}
    if req.keyword is not None:
        data["keyword"] = req.keyword
    if req.product_info is not None:
        data["product_info"] = req.product_info
    if req.priority is not None:
        data["priority"] = req.priority
    if req.status is not None:
        data["status"] = req.status
    await db.update_keyword(kw_id, data)
    return {"message": "키워드가 수정되었습니다."}


@app.delete("/api/keywords/{kw_id}")
async def delete_keyword_api(kw_id: int):
    deleted = await db.delete_keyword(kw_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="키워드를 찾을 수 없습니다.")
    return {"message": "키워드가 삭제되었습니다."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 스케줄러 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/scheduler/config")
async def get_scheduler_config():
    return await db.get_scheduler_config()


@app.put("/api/scheduler/config")
async def update_scheduler_config(req: SchedulerConfigUpdate):
    data = {k: v for k, v in req.dict().items() if v is not None}
    await db.update_scheduler_config(data)

    # 참여 관련 설정이 변경되면 스케줄러 잡 즉시 갱신
    engagement_keys = {"engagement_enabled", "engagement_hour", "engagement_minute"}
    if engagement_keys & data.keys():
        try:
            from scheduler import update_engagement_job
            await update_engagement_job()
        except Exception as e:
            logger.warning(f"참여 잡 갱신 실패: {e}")

    return await db.get_scheduler_config()


@app.post("/api/scheduler/start")
async def start_scheduler_api():
    from scheduler import start_scheduler
    await db.update_scheduler_config({"is_active": 1})
    await start_scheduler()
    return {"message": "스케줄러가 시작되었습니다."}


@app.post("/api/scheduler/stop")
async def stop_scheduler_api():
    from scheduler import stop_scheduler
    await db.update_scheduler_config({"is_active": 0})
    await stop_scheduler()
    return {"message": "스케줄러가 중지되었습니다."}


@app.get("/api/scheduler/status")
async def get_scheduler_status():
    from scheduler import get_scheduler_status
    return get_scheduler_status()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 알림 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/notifications")
async def get_notifications(unread_only: bool = False):
    return await db.get_notifications(unread_only)


@app.put("/api/notifications/{nid}/read")
async def mark_notification_read(nid: int):
    await db.mark_notification_read(nid)
    return {"message": "읽음 처리되었습니다."}


@app.delete("/api/notifications/{nid}")
async def delete_notification(nid: int):
    deleted = await db.delete_notification(nid)
    if not deleted:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    return {"message": "알림이 삭제되었습니다."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 참여(공감/댓글) API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 참여 실행 상태 추적
_engagement_status = {}


@app.post("/api/engagement/run")
async def run_engagement_now(request: Request, background_tasks: BackgroundTasks):
    """수동으로 참여(공감/댓글) 실행"""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")

    # 요청 본문에서 계정 ID 목록 읽기 (프론트엔드에서 직접 전달)
    try:
        body = await request.json()
    except Exception:
        body = {}
    request_account_ids = body.get("account_ids", None)

    # 스케줄러 설정에서 참여 옵션 읽기
    try:
        config = await db.get_scheduler_config()
        max_posts = config.get("engagement_max_posts", 10)
        do_like = bool(config.get("engagement_do_like", 1))
        do_comment = bool(config.get("engagement_do_comment", 1))
    except Exception:
        config = {}
        max_posts = 10
        do_like = True
        do_comment = True

    # 활성 계정 목록 (요청 본문의 계정 ID 우선, 없으면 설정에서 읽기)
    all_accounts = await db.get_accounts()
    active_accounts = [a for a in all_accounts if a.get("is_active")]

    # 요청에서 직접 전달된 계정 ID가 있으면 우선 사용
    if request_account_ids is not None and len(request_account_ids) > 0:
        selected_ids = request_account_ids
    else:
        selected_ids = config.get("engagement_account_ids", [])

    if selected_ids:
        # selected_ids 순서를 보존하여 필터링
        account_map = {a["id"]: a for a in active_accounts}
        active_accounts = [account_map[aid] for aid in selected_ids if aid in account_map]

    if not active_accounts:
        raise HTTPException(status_code=400, detail="참여에 사용할 활성 계정이 없습니다. 참여 설정에서 계정을 선택해주세요.")

    run_id = int(datetime.now().timestamp())
    _engagement_status[run_id] = {
        "status": "running",
        "total_accounts": len(active_accounts),
        "completed_accounts": 0,
        "total_likes": 0,
        "total_comments": 0,
    }

    background_tasks.add_task(
        _run_engagement_all_accounts,
        run_id, active_accounts, api_key, max_posts, do_like, do_comment,
    )
    return {"run_id": run_id, "message": f"{len(active_accounts)}개 계정으로 참여가 시작되었습니다."}


async def _run_engagement_all_accounts(
    run_id: int, accounts: list, api_key: str,
    max_posts: int, do_like: bool, do_comment: bool,
):
    """모든 활성 계정으로 순차 참여 실행"""
    from blog_engagement import run_engagement

    total_likes = 0
    total_comments = 0

    for i, account in enumerate(accounts):
        account_id = account["id"]
        logger.info(f"참여 실행 [{i+1}/{len(accounts)}]: 계정 {account.get('account_name', account_id)}")

        try:
            naver_id = decrypt(account["naver_id"])
            naver_pw = decrypt(account["naver_password"])

            result = await run_engagement(
                account_id, naver_id, naver_pw,
                api_key, max_posts, do_like, do_comment,
            )

            # DB에 이력 저장
            for eng in result.get("results", []):
                await db.create_engagement(
                    {
                        "account_id": account_id,
                        "post_url": eng.get("post_url", ""),
                        "post_title": eng.get("post_title", ""),
                        "like_success": eng.get("like_success", False),
                        "comment_success": eng.get("comment_success", False),
                        "comment_text": eng.get("comment_text", ""),
                        "error_message": eng.get("error", ""),
                    }
                )

            total_likes += result.get("like_count", 0)
            total_comments += result.get("comment_count", 0)

        except Exception as e:
            logger.error(f"참여 실행 오류 (계정 {account_id}): {e}")

        _engagement_status[run_id]["completed_accounts"] = i + 1
        _engagement_status[run_id]["total_likes"] = total_likes
        _engagement_status[run_id]["total_comments"] = total_comments

        # 계정 간 대기 (30초~1분)
        if i < len(accounts) - 1:
            delay = random.uniform(30, 60)
            logger.info(f"다음 계정까지 {delay:.0f}초 대기")
            await asyncio.sleep(delay)

    _engagement_status[run_id]["status"] = "completed"
    logger.info(f"참여 완료: 공감 {total_likes}, 댓글 {total_comments}")

    try:
        await db.create_notification({
            "type": "success",
            "title": "참여 완료",
            "message": f"공감 {total_likes}개, 댓글 {total_comments}개 완료",
        })
    except Exception:
        pass


@app.get("/api/engagement/status/{run_id}")
async def get_engagement_status(run_id: int):
    """참여 실행 상태 조회"""
    status = _engagement_status.get(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="실행 상태를 찾을 수 없습니다.")
    return status


@app.get("/api/engagement/history")
async def get_engagement_history(limit: int = Query(100, ge=1, le=500)):
    """참여 이력 조회"""
    return await db.get_engagement_history(limit)


@app.get("/api/engagement/stats")
async def get_engagement_stats():
    """참여 통계"""
    return await db.get_engagement_stats()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 헬스체크
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/health")
async def health():
    """DB 연결 상태 포함 헬스체크"""
    db_ok = False
    try:
        pool = await db._get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                db_ok = True
    except Exception:
        pass

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "version": "2.1.0",
        "database": "connected" if db_ok else "disconnected",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
