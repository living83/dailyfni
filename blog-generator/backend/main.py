"""
FastAPI 서버 - 네이버 블로그 상품 설명 자동 생성기
SSE(Server-Sent Events)로 진행 상태를 실시간 전송합니다.
"""

import json
import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from agents import run_research_agent, run_seo_agent, run_writer_agent, run_reviewer_agent

app = FastAPI(title="DailyFNI Blog Generator")

# 프론트엔드 정적 파일 서빙
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


class GenerateRequest(BaseModel):
    api_key: str
    title_keyword: str
    product_info: str


@app.get("/")
async def serve_frontend():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


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
            # Step 1: 리서치
            yield send_event("progress", {"step": "researching", "message": "상품 정보 분석 중..."})
            await asyncio.sleep(0)
            research_data = await asyncio.to_thread(run_research_agent, req.api_key, req.product_info)
            yield send_event("progress", {"step": "research_done", "message": "상품 분석 완료"})

            # Step 2: SEO
            yield send_event("progress", {"step": "seo", "message": "SEO 키워드 분석 중..."})
            await asyncio.sleep(0)
            seo_data = await asyncio.to_thread(run_seo_agent, req.api_key, research_data, req.title_keyword)
            yield send_event("progress", {"step": "seo_done", "message": "SEO 분석 완료"})

            main_keyword = seo_data["main_keyword"]
            sub_keywords = seo_data["sub_keywords"]
            titles = seo_data["blog_titles"]

            # Step 3: 라이터 (3가지 톤)
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

            # Step 4: 리뷰어 (각 글 검수)
            yield send_event("progress", {"step": "reviewing", "message": "품질 검수 중..."})
            await asyncio.sleep(0)

            reviews = {}
            for tone, content in articles.items():
                reviews[tone] = await asyncio.to_thread(
                    run_reviewer_agent, req.api_key, main_keyword, content
                )
            yield send_event("progress", {"step": "reviewing_done", "message": "검수 완료"})

            # 최종 결과
            result = {
                "research": research_data,
                "seo": seo_data,
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
