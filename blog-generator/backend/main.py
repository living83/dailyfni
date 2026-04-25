"""
FastAPI 서버 - DailyFNI 블로그 자동화 통합 API
SSE(Server-Sent Events)로 진행 상태를 실시간 전송합니다.
"""

import json
import asyncio
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from agents import run_research_agent, run_seo_agent, run_writer_agent, run_reviewer_agent, _call_claude

# Playwright 모듈 경로 추가
BLOG_GEN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BLOG_GEN_DIR))

app = FastAPI(title="DailyFNI Blog Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 프론트엔드 정적 파일 서빙
FRONTEND_DIR = BLOG_GEN_DIR / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ─── 기존 블로그 생성기 요청 모델 ───
class GenerateRequest(BaseModel):
    api_key: str
    product_info: str


# ─── 대시보드 통합 요청 모델 ───
class DashboardGenerateRequest(BaseModel):
    content_id: str
    keyword: str
    tone: str = "친근톤"
    content_type: str = "일반 정보성"
    product_info: str = ""
    api_key: str = ""

class PublishRequest(BaseModel):
    posting_id: str
    account: dict
    post_data: dict

class EngageRequest(BaseModel):
    account: dict
    blog_url: str
    actions: dict  # {like: bool, comment: str | None}

class FeedRequest(BaseModel):
    account: dict
    max_posts: int = 20


@app.get("/")
async def serve_frontend():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"message": "DailyFNI API Server"}


# ═══════════════════════════════════════════════════════
# 기존 블로그 생성기 (3톤 동시 생성)
# ═══════════════════════════════════════════════════════

@app.post("/api/generate")
async def generate(req: GenerateRequest):
    """SSE 스트림으로 파이프라인 진행 상태 + 최종 결과를 전송"""
    if not req.api_key or not req.api_key.startswith("sk-ant-"):
        raise HTTPException(status_code=400, detail="유효한 Anthropic API 키를 입력하세요.")
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
            seo_data = await asyncio.to_thread(run_seo_agent, req.api_key, research_data)
            yield send_event("progress", {"step": "seo_done", "message": "SEO 분석 완료"})

            main_keyword = seo_data["main_keyword"]
            sub_keywords = seo_data["sub_keywords"]
            titles = seo_data["blog_titles"]

            yield send_event("progress", {"step": "writing", "message": "블로그 글 작성 중... (3가지 톤)"})
            await asyncio.sleep(0)

            articles = {}
            tones = [("friendly", titles["friendly"]), ("expert", titles["expert"]), ("review", titles["review"])]
            for tone, title in tones:
                articles[tone] = await asyncio.to_thread(
                    run_writer_agent, req.api_key, tone, title, main_keyword, sub_keywords, research_data
                )
            yield send_event("progress", {"step": "writing_done", "message": "글 작성 완료"})

            yield send_event("progress", {"step": "reviewing", "message": "품질 검수 중..."})
            await asyncio.sleep(0)

            reviews = {}
            for tone, content in articles.items():
                reviews[tone] = await asyncio.to_thread(run_reviewer_agent, req.api_key, main_keyword, content)
            yield send_event("progress", {"step": "reviewing_done", "message": "검수 완료"})

            result = {
                "research": research_data,
                "seo": seo_data,
                "articles": {
                    "friendly": {"title": titles["friendly"], "content": articles["friendly"], "review": reviews["friendly"]},
                    "expert": {"title": titles["expert"], "content": articles["expert"], "review": reviews["expert"]},
                    "review": {"title": titles["review"], "content": articles["review"], "review": reviews["review"]},
                },
            }
            yield send_event("complete", result)
        except Exception as e:
            yield send_event("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ═══════════════════════════════════════════════════════
# 대시보드 통합 API — 콘텐츠 생성
# ═══════════════════════════════════════════════════════

TONE_MAP = {"친근톤": "friendly", "전문톤": "expert", "리뷰톤": "review"}

@app.post("/api/dashboard/generate")
async def dashboard_generate(req: DashboardGenerateRequest):
    """대시보드에서 단일 키워드 + 단일 톤으로 블로그 글 생성 (SSE)"""
    import os
    api_key = req.api_key or os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="API 키가 설정되지 않았습니다.")

    tone_en = TONE_MAP.get(req.tone, "friendly")

    async def event_stream():
        def send(event, data):
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        try:
            # Step 1: 키워드 기반 리서치
            yield send("progress", {"step": "researching", "content_id": req.content_id})
            product_text = f"키워드: {req.keyword}"
            if req.product_info:
                product_text += f"\n상품 정보:\n{req.product_info}"
            research = await asyncio.to_thread(run_research_agent, api_key, product_text)
            yield send("progress", {"step": "research_done", "content_id": req.content_id})

            # Step 2: SEO
            yield send("progress", {"step": "seo", "content_id": req.content_id})
            seo = await asyncio.to_thread(run_seo_agent, api_key, research)
            yield send("progress", {"step": "seo_done", "content_id": req.content_id})

            main_kw = seo.get("main_keyword", req.keyword)
            sub_kws = seo.get("sub_keywords", [])
            titles = seo.get("blog_titles", {})
            title = titles.get(tone_en, f"{req.keyword} 블로그 글")

            # Step 3: 글 작성 (단일 톤)
            yield send("progress", {"step": "writing", "content_id": req.content_id})
            body = await asyncio.to_thread(
                run_writer_agent, api_key, tone_en, title, main_kw, sub_kws, research
            )
            yield send("progress", {"step": "writing_done", "content_id": req.content_id})

            # Step 4: 검수
            yield send("progress", {"step": "reviewing", "content_id": req.content_id})
            review = await asyncio.to_thread(run_reviewer_agent, api_key, main_kw, body)
            yield send("progress", {"step": "reviewing_done", "content_id": req.content_id})

            grade = review.get("grade", "B")
            tags = seo.get("tags", [])

            yield send("complete", {
                "content_id": req.content_id,
                "title": title,
                "body": body,
                "tags": tags,
                "grade": grade,
                "review": review,
            })

        except Exception as e:
            yield send("error", {"content_id": req.content_id, "message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ═══════════════════════════════════════════════════════
# 대시보드 통합 API — 블로그 발행 (Playwright)
# ═══════════════════════════════════════════════════════

@app.post("/api/dashboard/publish")
async def dashboard_publish(req: PublishRequest):
    """Playwright로 네이버 블로그에 글 발행"""
    try:
        from browser.publisher import publish_single_post
        result = await publish_single_post(req.account, req.post_data)
        return {"success": result.get("success", False), "url": result.get("url"), "error": result.get("error")}
    except ImportError as e:
        return {"success": False, "error": f"Playwright 모듈 로드 실패: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════
# 대시보드 통합 API — 이웃참여
# ═══════════════════════════════════════════════════════

@app.post("/api/dashboard/engage")
async def dashboard_engage(req: EngageRequest):
    """단일 포스트 공감 (댓글 기능 제거됨)"""
    try:
        from browser.engager import engage_neighbor
        result = await engage_neighbor(req.account, req.blog_url, req.actions)
        return result
    except ImportError as e:
        return {"success": True, "liked": req.actions.get("like", False), "error": f"(mock) {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


class EngageBatchRequest(BaseModel):
    account: dict
    config: dict  # { engagement_max_posts, engagement_do_like }

@app.post("/api/dashboard/engage/run")
async def dashboard_engage_run(req: EngageBatchRequest):
    """배치 이웃참여 실행 — ThemePost 수집 후 순회하며 공감"""
    try:
        from browser.engager import run_engagement
        result = await run_engagement(req.account, req.config)
        return result
    except ImportError as e:
        return {"account_id": req.account.get("id"), "total_posts": 0, "like_count": 0, "error": f"Playwright 미설치: {e}"}
    except Exception as e:
        return {"account_id": req.account.get("id"), "total_posts": 0, "like_count": 0, "error": str(e)}


@app.post("/api/dashboard/feed")
async def dashboard_feed(req: FeedRequest):
    """이웃 블로그 피드 수집 (Playwright 크롤링 시도 → mock 폴백)"""
    try:
        from browser.engager import crawl_neighbor_feed
        feed = await crawl_neighbor_feed(req.account, max_posts=req.max_posts)
        if feed:
            return {"success": True, "feed": feed}
    except Exception as e:
        print(f"[Feed] 크롤링 실패 (mock 사용): {e}")

    # 폴백: mock 피드
    mock_feed = [
        {"id": "1", "blogName": "여행매니아", "title": "제주도 3박4일 가성비 여행 코스 추천", "url": "", "timeAgo": "2시간 전", "liked": False, "commented": False},
        {"id": "2", "blogName": "맛집탐험가", "title": "강남역 숨은 맛집 TOP 5", "url": "", "timeAgo": "3시간 전", "liked": False, "commented": False},
        {"id": "3", "blogName": "IT트렌드", "title": "2026년 AI 트렌드 총정리", "url": "", "timeAgo": "5시간 전", "liked": False, "commented": False},
        {"id": "4", "blogName": "재테크초보", "title": "월 100만원 저축하는 방법", "url": "", "timeAgo": "6시간 전", "liked": False, "commented": False},
        {"id": "5", "blogName": "인테리어팁", "title": "10평 원룸 넓어 보이는 인테리어", "url": "", "timeAgo": "8시간 전", "liked": False, "commented": False},
    ]
    return {"success": True, "feed": mock_feed[:req.max_posts]}


# ═══════════════════════════════════════════════════════
# 중복 체크 API
# ═══════════════════════════════════════════════════════

class DuplicateCheckRequest(BaseModel):
    title: str
    keywords: Optional[list[str]] = None

@app.post("/api/dashboard/check-duplicate")
async def check_duplicate_endpoint(req: DuplicateCheckRequest):
    """포스팅 발행 전 네이버 블로그 검색으로 중복 체크"""
    from duplicate_checker import check_duplicate
    result = await check_duplicate(req.title, req.keywords)
    return result


@app.get("/api/health")
async def health():
    return {"status": "ok", "server": "python-fastapi", "port": 8000}


# ═══════════════════════════════════════════════════════
# 블로그 스타일 분석 API
# ═══════════════════════════════════════════════════════

class AnalyzeRequest(BaseModel):
    urls: list[str]
    max_posts: int = 5

@app.post("/api/dashboard/blog/analyze")
async def dashboard_blog_analyze(req: AnalyzeRequest):
    """블로그 URL 목록을 크롤링하여 글쓰기 스타일을 분석합니다."""
    try:
        from ai.blog_analyzer import crawl_blog_posts, generate_style_guide, save_style_data
        analyses = await crawl_blog_posts(req.urls, max_posts=req.max_posts)
        guide = generate_style_guide(analyses)
        save_style_data(analyses, guide)
        return {"success": True, "analyses": analyses, "guide": guide}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/dashboard/blog/style-guide")
async def dashboard_style_guide():
    """저장된 스타일 가이드를 반환합니다."""
    try:
        from ai.blog_analyzer import load_style_data
        data = load_style_data()
        if data:
            return {"success": True, **data}
        return {"success": False, "message": "아직 분석된 스타일 가이드가 없습니다."}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════
# 대시보드 통합 API — 서로이웃 자동 수락
# ═══════════════════════════════════════════════════════

class BuddyAcceptRequest(BaseModel):
    account: dict
    config: dict  # { max_accept, accept_mode }

class BuddyPendingRequest(BaseModel):
    account: dict

@app.post("/api/dashboard/buddy/accept")
async def dashboard_buddy_accept(req: BuddyAcceptRequest):
    """서로이웃 신청 일괄 수락"""
    try:
        from browser.buddy import accept_buddy_requests
        result = await accept_buddy_requests(req.account, req.config)
        return result
    except ImportError as e:
        return {"success": False, "accepted_count": 0, "error": f"모듈 로드 실패: {e}"}
    except Exception as e:
        return {"success": False, "accepted_count": 0, "error": str(e)}

@app.post("/api/dashboard/buddy/pending")
async def dashboard_buddy_pending(req: BuddyPendingRequest):
    """서로이웃 대기 신청 수 조회"""
    try:
        from browser.buddy import get_pending_count
        result = await get_pending_count(req.account)
        return result
    except ImportError as e:
        return {"success": False, "pending_count": 0, "error": f"모듈 로드 실패: {e}"}
    except Exception as e:
        return {"success": False, "pending_count": 0, "error": str(e)}


# ═══════════════════════════════════════════════════════
# 대시보드 통합 API — 티스토리 발행
# ═══════════════════════════════════════════════════════

class TistoryPublishRequest(BaseModel):
    account: dict
    post_data: dict

@app.post("/api/dashboard/tistory/publish")
async def dashboard_tistory_publish(req: TistoryPublishRequest):
    """Playwright로 티스토리 블로그에 글 발행"""
    try:
        from browser.tistory_publisher import publish_tistory_post
        result = await publish_tistory_post(req.account, req.post_data)
        return result
    except ImportError as e:
        return {"success": False, "error": f"모듈 로드 실패: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
