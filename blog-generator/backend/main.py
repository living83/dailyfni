"""
FastAPI 서버 - 네이버 블로그 자동 발행 시스템
SSE(Server-Sent Events)로 진행 상태를 실시간 전송합니다.
"""

import os
import json
import asyncio
import csv
import io
import logging
import random
from pathlib import Path
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List

from agents import (
    run_research_agent, run_seo_agent, run_writer_agent, run_reviewer_agent,
    _call_claude,
)
from prompts import DOC_TUTORIAL_PROMPT, DOC_REVIEW_PROMPT, DOC_ANALYSIS_PROMPT
import database as db
from crypto import encrypt, decrypt
from image_generator import generate_keyword_image

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

# ─── FastAPI 앱 ──────────────────────────────────────────

app = FastAPI(title="DailyFNI - 네이버 블로그 자동 발행 시스템")

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
    await db.init_db()
    logger.info("데이터베이스 초기화 완료")
    # 스케줄러 자동 시작
    config = await db.get_scheduler_config()
    if config.get("is_active"):
        from scheduler import start_scheduler
        await start_scheduler()
        logger.info("스케줄러 자동 시작")


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
    if v not in ("high", "medium", "low"):
        raise ValueError("priority는 high, medium, low 중 하나여야 합니다.")
    return v


class GenerateRequest(BaseModel):
    api_key: str
    title_keyword: str
    product_info: str

    @validator("api_key")
    def check_api_key(cls, v):
        return _validate_api_key(v)

    @validator("title_keyword")
    def check_title(cls, v):
        return _validate_max_length(v.strip(), 100, "제목 키워드")

    @validator("product_info")
    def check_product(cls, v):
        return _validate_max_length(v, 10000, "상품 정보")


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


class DocumentGenerateRequest(BaseModel):
    api_key: str
    keyword: str
    product_info: str = ""

    @validator("api_key")
    def check_api_key(cls, v):
        return _validate_api_key(v)

    @validator("keyword")
    def check_keyword(cls, v):
        return _validate_max_length(v.strip(), 200, "키워드")

    @validator("product_info")
    def check_product(cls, v):
        return _validate_max_length(v, 10000, "상품 정보")


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
    priority: str = "medium"

    @validator("keyword")
    def check_keyword(cls, v):
        return _validate_max_length(v.strip(), 200, "키워드")

    @validator("priority")
    def check_priority(cls, v):
        return _validate_priority(v)


class KeywordBulkCreate(BaseModel):
    keywords: List[str]
    priority: str = "medium"

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
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 기존 블로그 글 생성 (상품 기반)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/generate")
async def generate(req: GenerateRequest):
    """SSE 스트림으로 파이프라인 진행 상태 + 최종 결과를 전송"""
    if not req.api_key or len(req.api_key) < 10:
        raise HTTPException(status_code=400, detail="유효한 Claude API 키를 입력하세요.")
    if not req.title_keyword.strip():
        raise HTTPException(status_code=400, detail="제목에 포함할 키워드를 입력하세요.")
    if not req.product_info.strip():
        raise HTTPException(status_code=400, detail="상품 정보를 입력하세요.")

    async def event_stream():
        def send_event(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        try:
            yield send_event("progress", {"step": "researching", "message": "상품 정보 분석 중..."})
            await asyncio.sleep(0)
            research_data = await asyncio.to_thread(run_research_agent, req.api_key, req.product_info)
            yield send_event("progress", {"step": "research_done", "message": "상품 분석 완료"})

            yield send_event("progress", {"step": "seo", "message": "SEO 키워드 분석 중..."})
            await asyncio.sleep(0)
            seo_data = await asyncio.to_thread(run_seo_agent, req.api_key, research_data, req.title_keyword)
            yield send_event("progress", {"step": "seo_done", "message": "SEO 분석 완료"})

            main_keyword = seo_data["main_keyword"]
            sub_keywords = seo_data["sub_keywords"]
            titles = seo_data["blog_titles"]

            yield send_event("progress", {"step": "writing", "message": "블로그 글 작성 중... (3가지 톤)"})
            await asyncio.sleep(0)

            articles = {}
            tones = [
                ("friendly", titles["friendly"]),
                ("expert", titles["expert"]),
                ("beginner", titles["beginner"]),
            ]
            for tone, title in tones:
                articles[tone] = await asyncio.to_thread(
                    run_writer_agent, req.api_key, tone, title, main_keyword, sub_keywords, research_data
                )
            yield send_event("progress", {"step": "writing_done", "message": "글 작성 완료"})

            yield send_event("progress", {"step": "reviewing", "message": "품질 검수 중..."})
            await asyncio.sleep(0)

            reviews = {}
            for tone, content in articles.items():
                reviews[tone] = await asyncio.to_thread(
                    run_reviewer_agent, req.api_key, main_keyword, content
                )
            yield send_event("progress", {"step": "reviewing_done", "message": "검수 완료"})

            # 키워드 대표이미지 생성
            keyword_image = ""
            try:
                keyword_image = await asyncio.to_thread(generate_keyword_image, main_keyword)
            except Exception as e:
                logger.warning(f"키워드 대표이미지 생성 실패: {e}")

            result = {
                "research": research_data,
                "seo": seo_data,
                "keyword_image": keyword_image,
                "articles": {
                    "friendly": {"title": titles["friendly"], "content": articles["friendly"], "review": reviews["friendly"]},
                    "expert": {"title": titles["expert"], "content": articles["expert"], "review": reviews["expert"]},
                    "beginner": {"title": titles["beginner"], "content": articles["beginner"], "review": reviews["beginner"]},
                },
            }
            yield send_event("complete", result)

        except Exception as e:
            yield send_event("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
# 문서 생성 API (키워드 → 3개 문서)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/documents/generate")
async def generate_documents(req: DocumentGenerateRequest):
    """키워드 하나로 3가지 관점의 문서를 생성"""
    if not req.api_key or len(req.api_key) < 10:
        raise HTTPException(status_code=400, detail="유효한 API 키를 입력하세요.")
    if not req.keyword.strip():
        raise HTTPException(status_code=400, detail="키워드를 입력하세요.")

    # 중복 키워드 경고
    is_dup = await db.check_keyword_duplicate(req.keyword, 7)

    async def event_stream():
        def send_event(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        try:
            if is_dup:
                yield send_event("warning", {"message": f"'{req.keyword}'는 최근 7일 내 사용된 키워드입니다."})

            doc_configs = [
                ("tutorial", DOC_TUTORIAL_PROMPT, "튜토리얼/가이드"),
                ("review", DOC_REVIEW_PROMPT, "경험담/후기"),
                ("analysis", DOC_ANALYSIS_PROMPT, "비교/분석"),
            ]

            # 상품소개가 있으면 프롬프트에 삽입
            product_info_section = ""
            if req.product_info.strip():
                product_info_section = f"\n상품소개:\n{req.product_info.strip()}\n"

            documents = []
            for i, (fmt, prompt_template, desc) in enumerate(doc_configs):
                yield send_event("progress", {"step": i + 1, "total": 3, "message": f"문서 {i+1} 생성 중... ({desc})"})
                await asyncio.sleep(0)

                prompt = prompt_template.format(keyword=req.keyword, product_info_section=product_info_section)
                result = await asyncio.to_thread(_call_claude, req.api_key, prompt, 4096)

                lines = result.strip().split("\n", 1)
                title = lines[0].strip().lstrip("# ").strip()
                body = lines[1].strip() if len(lines) > 1 else result

                documents.append({
                    "document_number": i + 1,
                    "format": fmt,
                    "format_label": desc,
                    "title": title,
                    "content": body,
                    "char_count": len(body),
                })

                yield send_event("doc_ready", {"document_number": i + 1, "title": title, "format": fmt})

            # 키워드 대표이미지 생성
            keyword_image = ""
            try:
                keyword_image = await asyncio.to_thread(generate_keyword_image, req.keyword)
            except Exception as e:
                logger.warning(f"키워드 대표이미지 생성 실패: {e}")

            yield send_event("complete", {
                "keyword": req.keyword,
                "documents": documents,
                "keyword_image": keyword_image,
                "is_duplicate_keyword": is_dup,
            })

        except Exception as e:
            yield send_event("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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

    _cleanup_publish_status()
    _publish_status[batch_id] = {
        "status": "publishing",
        "documents": [],
        "current": 0,
    }
    _publish_status_timestamps[batch_id] = datetime.now().timestamp()

    # 키워드 대표이미지 생성
    keyword_image_path = ""
    try:
        keyword_image_path = await asyncio.to_thread(generate_keyword_image, keyword)
        logger.info(f"키워드 대표이미지 생성 완료: {keyword_image_path}")
    except Exception as e:
        logger.warning(f"키워드 대표이미지 생성 실패 (계속 진행): {e}")

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

        # 계정 간 딜레이 (첫 번째 제외)
        if i > 0:
            delay = random.uniform(2, 5)
            logger.info(f"계정 간 딜레이: {delay:.1f}초")
            await asyncio.sleep(delay)

        # 발행
        try:
            naver_id = decrypt(account["naver_id"])
            naver_pw = decrypt(account["naver_password"])
            tags = doc.get("keywords", [keyword])

            pub_result = await run_publish_task(
                account_id, naver_id, naver_pw,
                doc.get("title", ""), doc.get("content", ""),
                cat_name, tags, keyword_image_path,
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
async def create_keywords_bulk(req: KeywordBulkCreate):
    keywords = [{"keyword": kw.strip(), "priority": req.priority} for kw in req.keywords if kw.strip()]
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
