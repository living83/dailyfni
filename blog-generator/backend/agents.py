"""
에이전트 파이프라인: 리서치 → SEO → 라이터(3톤) → 리뷰어
각 에이전트는 Claude API를 호출하여 결과를 반환합니다.
"""

import json
import anthropic
from prompts import (
    RESEARCH_PROMPT,
    SEO_PROMPT,
    WRITER_FRIENDLY_PROMPT,
    WRITER_EXPERT_PROMPT,
    WRITER_REVIEW_PROMPT,
    REVIEWER_PROMPT,
)


def _call_claude(api_key: str, prompt: str, max_tokens: int = 4096) -> str:
    """Claude API 호출 공통 함수"""
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _parse_json(text: str) -> dict:
    """Claude 응답에서 JSON 추출"""
    # 코드 블록 안에 있을 경우 추출
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    # 중괄호 범위 추출
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("JSON을 찾을 수 없습니다.")

    return json.loads(text[start:end])


# === 1. 리서치 에이전트 ===
def run_research_agent(api_key: str, product_info: str) -> dict:
    """상품 정보를 JSON으로 정리"""
    prompt = RESEARCH_PROMPT.format(product_info=product_info)
    response = _call_claude(api_key, prompt)
    return _parse_json(response)


# === 2. SEO 에이전트 ===
def run_seo_agent(api_key: str, research_data: dict) -> dict:
    """네이버 블로그용 키워드, 제목, 태그 생성"""
    prompt = SEO_PROMPT.format(research_data=json.dumps(research_data, ensure_ascii=False, indent=2))
    response = _call_claude(api_key, prompt)
    return _parse_json(response)


# === 3. 라이터 에이전트 ===
def run_writer_agent(api_key: str, tone: str, title: str, main_keyword: str, sub_keywords: list, research_data: dict) -> str:
    """톤별 블로그 글 생성 — 저장된 스타일 가이드가 있으면 자동 주입"""
    template_map = {
        "friendly": WRITER_FRIENDLY_PROMPT,
        "expert": WRITER_EXPERT_PROMPT,
        "review": WRITER_REVIEW_PROMPT,
    }
    template = template_map.get(tone)
    if not template:
        raise ValueError(f"지원하지 않는 톤입니다: {tone}")

    prompt = template.format(
        title=title,
        main_keyword=main_keyword,
        sub_keywords=", ".join(sub_keywords),
        research_data=json.dumps(research_data, ensure_ascii=False, indent=2),
    )

    # 스타일 가이드 자동 주입 (저장된 분석 결과가 있는 경우)
    try:
        from ai.blog_analyzer import load_style_guide
        guide = load_style_guide()
        if guide:
            prompt += f"\n\n--- 참고: 인기 블로그 분석 기반 스타일 가이드 ---\n{guide}\n위 가이드를 참고하되, 자연스럽게 반영하세요."
    except Exception:
        pass

    return _call_claude(api_key, prompt, max_tokens=4096)


# === 4. 리뷰어 에이전트 ===
def run_reviewer_agent(api_key: str, main_keyword: str, content: str) -> dict:
    """맞춤법, SEO, 저품질 검수"""
    prompt = REVIEWER_PROMPT.format(main_keyword=main_keyword, content=content)
    response = _call_claude(api_key, prompt)
    return _parse_json(response)


# === 전체 파이프라인 ===
async def run_pipeline(api_key: str, product_info: str, progress_callback=None):
    """
    전체 에이전트 파이프라인 실행
    Returns: {
        research: dict,
        seo: dict,
        articles: { friendly: str, expert: str, review: str },
        reviews: { friendly: dict, expert: dict, review: dict },
    }
    """
    # Step 1: 리서치
    if progress_callback:
        await progress_callback("researching")
    research_data = run_research_agent(api_key, product_info)

    # Step 2: SEO
    if progress_callback:
        await progress_callback("seo")
    seo_data = run_seo_agent(api_key, research_data)

    main_keyword = seo_data["main_keyword"]
    sub_keywords = seo_data["sub_keywords"]
    titles = seo_data["blog_titles"]

    # Step 3: 라이터 (3가지 톤)
    if progress_callback:
        await progress_callback("writing")

    articles = {}
    for tone, title in [("friendly", titles["friendly"]), ("expert", titles["expert"]), ("review", titles["review"])]:
        articles[tone] = run_writer_agent(api_key, tone, title, main_keyword, sub_keywords, research_data)

    # Step 4: 리뷰어 (각 글 검수)
    if progress_callback:
        await progress_callback("reviewing")

    reviews = {}
    for tone, content in articles.items():
        reviews[tone] = run_reviewer_agent(api_key, main_keyword, content)

    return {
        "research": research_data,
        "seo": seo_data,
        "articles": articles,
        "reviews": reviews,
    }
