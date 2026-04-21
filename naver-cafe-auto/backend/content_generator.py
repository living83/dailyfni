"""
content_generator.py - Claude 3.5 Sonnet 기반 네이버 카페 글 내용 자동 생성
"""
import os
import json
import asyncio
import random
import logging
from typing import Dict, Any
import anthropic
from dotenv import load_dotenv

logger = logging.getLogger("content_generator")

# 최상위 폴더의 .env 로드
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "config", ".env"))


def get_tone_instructions(tone: str) -> str:
    if tone == "전문가":
        return "- 객관적이고 신뢰감을 주는 존댓말(~습니다, ~합니다) 사용.\n- 정확한 정보 전달 목적."
    elif tone == "정보공유":
        return "- 같은 회원들에게 유용한 정보를 나누는 친절하고 부드러운 톤(~해요, ~에요).\n- 이모지를 적당히 섞어서 카페 고유의 친근함을 유지."
    else:  # 기본: 공감/후기형 (자유게시판 스타일)
        return "- 직접 경험한 것을 카페 회원들에게 털어놓듯 친근하고 공감되는 톤(~했어요, ~더라구요).\n- 고민을 나눌 때의 답답함과 해결 후의 시원함을 감정적으로 표현.\n- 이모지(😂, 🤔, 👍 등)를 적절히 활용."


STICKER_OPTIONS = [
    {"pack": "cafe_012", "seq": "19"},
    {"pack": "cafe_012", "seq": "1"},
    {"pack": "cafe_012", "seq": "5"},
]


async def async_generate_content(keyword: str, tone: str = "공감", cta_link: str = "", description: str = "") -> dict:
    """
    Claude API를 사용하여 네이버 카페에 적합한 자연스러운 글을 생성.
    기존 구조화된 dict 포맷을 반환하여 publisher와 호환성을 유지함.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY가 등록되지 않았습니다.")

    client = anthropic.AsyncAnthropic(api_key=api_key)
    tone_guide = get_tone_instructions(tone)

    # 특징/맥락이 있으면 프롬프트에 추가
    description_section = ""
    if description and description.strip():
        description_section = f"""
[추가 특징 / 맥락]
{description.strip()}
→ 위 특징을 관련 사실이나 경험, 또는 정보로 자연스럽게 글 내용에 녹여 다시세요.
"""

    prompt = f"""
당신은 네이버 카페 회원입니다. 특정 목적(광고/홍보)이 있더라도 최대한 자연스럽고 진짜 회원이 쓴 후기나 고민글, 정보공유글처럼 생생하게 작성해야 합니다.

[작성 조건]
1. 주제 키워드(또는 상품명): "{keyword}"
2. 글의 목적: 해당 키워드를 알아보고 있거나 해결한 경험담 공유.
3. 문체 가이드: {tone_guide}
4. 길이는 1000자 ~ 1500자 사이로 작성.
{description_section}

[포맷 규칙 - 반드시 준수]
- content_paragraphs의 각 항목은 반드시 한 문장만 넣으세요.
- 마침표(.), 물음표(?), 느낌표(!)로 끝나는 문장마다 반드시 새 항목으로 담으세요.
- 문단 사이 빈 줄 효과는 빈 문자열 ""로 표현하세요.
- 마크다운 형식(#, ** 등)이나 HTML 태그를 일체 쓰지 마세요.
- 결과물은 반드시 유효한 JSON 형식이어야 합니다. 다른 말은 덧붙이지 마세요.

[글의 흐름]
- 1. 서론: 키워드와 관련된 자신의 상황이나 답답했던 고민 토로 + 회원들에게 인사
- 2. 본론: 발품 팔거나 알게된 정보, 주의할 점, 직접 겪은 후기
- 3. 결론: "저처럼 {keyword} 찾으시면 도움받아보세요" 식의 마무리 + 응원

[컨텍스트 예시 - 이런 형식으로]
{{
    "title": "[카페 제목 추천형] 클릭을 유도하는 친근한 카페글 제목",
    "content_paragraphs": [
        "안녕하세요!",
        "오늘 처음 글 남겨보네요.",
        "",
        "요즘 {keyword} 때문에 고민이 참 많았어요.",
        "할수록 복잡하더라구요.",
        "",
        "..."
    ]
}}
"""
    logger.info(f"Claude 3.5 API 요청: 키워드 '{keyword}', 톤 '{tone}'")

    response = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4000,
        temperature=0.8,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    text = response.content[0].text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)

        # publisher.py 호환을 위한 sections 배열로 맵핑
        # Claude가 한 paragraph에 여러 문장을 넣을 경우를 대비한 분리 safeguard
        import re as _re

        def _split_sentences(text: str) -> list:
            """한 paragraph 내 여러 문장을 마침표/물음표/느낌표 기준으로 분리."""
            text = text.strip()
            if not text:
                return [""]
            # 마침표/?/! 뒤에 공백+한글이 오는 경우에만 분리
            parts = _re.split(r'(?<=[.!?])\s+(?=[\uAC00-\uD7A3a-zA-Z0-9])', text)
            return [p.strip() for p in parts if p.strip()]

        lines_formatted = []
        for para in parsed["content_paragraphs"]:
            if not para.strip():
                lines_formatted.append({"text": "", "style": "empty"})
            else:
                sentences = _split_sentences(para)
                for sent in sentences:
                    lines_formatted.append({"text": sent, "style": "normal"})

        sections = [
            {"type": "text", "lines": lines_formatted},
        ]

        if cta_link:
            sections.append({
                "type": "cta_table",
                "text": f"{keyword} 무료 전문가 상담 및 비교하기",
                "link": cta_link
            })

        sections.append({
            "type": "sticker",
            "pack": random.choice(STICKER_OPTIONS)["pack"],
            "seq": random.choice(STICKER_OPTIONS)["seq"]
        })
        sections.append({"type": "image"})

        return {
            "title": parsed["title"],
            "sections": sections
        }

    except Exception as e:
        logger.error(f"Claude JSON 파싱 실패: {e}\n[응답원본]\n{text}")
        raise


def generate_content(keyword: str, tone: str = "공감", cta_link: str = "", description: str = "") -> dict:
    """동기 래퍼 - 별도 스레드에서 새 이벤트 루프 실행 (이벤트 루프 충돌 방지)."""
    import concurrent.futures

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(async_generate_content(keyword, tone, cta_link, description))
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(_run).result()


def content_to_plain_text(structured: dict) -> tuple:
    """
    generate_content()의 반환값에서 (title, plain_text)를 추출.
    scheduler.py에서 DB 저장용 텍스트를 만들 때 사용.
    """
    title = structured.get("title", "")
    lines = []
    for section in structured.get("sections", []):
        if section.get("type") == "text":
            for line in section.get("lines", []):
                lines.append(line.get("text", ""))
        elif section.get("type") == "cta_table":
            lines.append(f"{section.get('text', '')} : {section.get('link', '')}")
    return title, "\n".join(lines)
