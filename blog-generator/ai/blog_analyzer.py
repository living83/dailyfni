"""
blog_analyzer.py — 네이버 블로그 크롤링 + 글쓰기 스타일 분석
인기 블로그의 포스팅 구조, 톤, 포인트를 학습하여
AI 글 생성 프롬프트에 주입할 스타일 가이드를 생성합니다.
"""

import asyncio
import re
import json
from typing import Optional
from pathlib import Path

from loguru import logger

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import settings


# ─────────────────────────────────────────────────
# 1. 크롤링: 네이버 블로그 포스트 수집
# ─────────────────────────────────────────────────

async def crawl_blog_posts(urls: list[str], max_posts: int = 5) -> list[dict]:
    """
    네이버 블로그 URL 목록에서 본문/제목/구조를 크롤링합니다.

    Args:
        urls: 블로그 포스트 URL 목록 (https://blog.naver.com/xxx/yyy)
        max_posts: 최대 수집 포스트 수

    Returns:
        [{ url, title, body_text, headings, paragraph_count, has_images,
           avg_sentence_length, tone_markers, structure }]
    """
    from playwright.async_api import async_playwright

    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )

        for url in urls[:max_posts]:
            try:
                page = await context.new_page()

                # 모바일 뷰 URL로 변환 (크롤링 용이)
                mobile_url = url.replace("blog.naver.com", "m.blog.naver.com")
                await page.goto(mobile_url, wait_until="domcontentloaded", timeout=20000)
                await asyncio.sleep(2)

                # 제목 추출
                title = ""
                for sel in [".se-title-text", ".tit_h3", "h3.se_textarea", ".post_tit"]:
                    el = await page.query_selector(sel)
                    if el:
                        title = (await el.inner_text()).strip()
                        break
                if not title:
                    title = await page.title()

                # 본문 텍스트 추출
                body_text = ""
                for sel in [".se-main-container", ".post_ct", "#postViewArea", ".se_component_wrap"]:
                    el = await page.query_selector(sel)
                    if el:
                        body_text = (await el.inner_text()).strip()
                        break

                if not body_text or len(body_text) < 50:
                    # iframe 접근 시도
                    for frame in page.frames:
                        el = await frame.query_selector("#postViewArea, .se-main-container")
                        if el:
                            body_text = (await el.inner_text()).strip()
                            if len(body_text) > 50:
                                break

                # 소제목 추출
                headings = []
                for sel in [".se-text-paragraph-align-center b", ".se-section-text strong", "h2, h3, h4"]:
                    els = await page.query_selector_all(sel)
                    for el in els[:10]:
                        txt = (await el.inner_text()).strip()
                        if 5 < len(txt) < 80:
                            headings.append(txt)

                # 이미지 포함 여부
                imgs = await page.query_selector_all(
                    ".se-image-resource, .se-component-image img, img[src*='blogfiles']"
                )
                has_images = len(imgs) > 0
                image_count = len(imgs)

                # 단락 수
                paragraphs = [p.strip() for p in body_text.split("\n\n") if p.strip()]
                paragraph_count = len(paragraphs)

                # 평균 문장 길이
                sentences = re.split(r'[.!?]\s+', body_text)
                sentences = [s for s in sentences if len(s) > 5]
                avg_sentence_length = sum(len(s) for s in sentences) / max(len(sentences), 1)

                # 톤 마커 분석
                tone_markers = _analyze_tone(body_text)

                # 구조 분석
                structure = _analyze_structure(body_text, headings, image_count, paragraph_count)

                results.append({
                    "url": url,
                    "title": title,
                    "body_text": body_text[:3000],  # 저장용 축약
                    "body_full_length": len(body_text),
                    "headings": headings,
                    "paragraph_count": paragraph_count,
                    "has_images": has_images,
                    "image_count": image_count,
                    "avg_sentence_length": round(avg_sentence_length, 1),
                    "tone_markers": tone_markers,
                    "structure": structure,
                })

                logger.info(f"크롤링 완료: {title[:30]}... ({len(body_text)}자)")
                await page.close()

            except Exception as e:
                logger.warning(f"크롤링 실패 {url}: {e}")
                results.append({"url": url, "error": str(e)})

        await context.close()
        await browser.close()

    return results


# ─────────────────────────────────────────────────
# 2. 톤/스타일 분석
# ─────────────────────────────────────────────────

def _analyze_tone(text: str) -> dict:
    """텍스트의 톤 마커를 분석합니다."""
    markers = {
        "formal_endings": 0,      # ~습니다, ~합니다
        "casual_endings": 0,      # ~해요, ~네요, ~거든요
        "question_marks": 0,      # 질문형
        "exclamations": 0,        # 감탄형
        "emoji_like": 0,          # 이모지/특수문자
        "first_person": 0,        # 저는, 제가
        "reader_address": 0,      # 여러분, ~분들
    }

    markers["formal_endings"] = len(re.findall(r'[습합][니]다', text))
    markers["casual_endings"] = len(re.findall(r'[해세]요|네요|거든요|죠|래요', text))
    markers["question_marks"] = text.count("?")
    markers["exclamations"] = text.count("!")
    markers["emoji_like"] = len(re.findall(r'[^\w\s,.!?~()·\-:;\'\"\/\\]', text))
    markers["first_person"] = len(re.findall(r'저[는가도]|제[가]', text))
    markers["reader_address"] = len(re.findall(r'여러분|분들|독자|당신', text))

    # 주요 톤 판정
    total = markers["formal_endings"] + markers["casual_endings"]
    if total > 0:
        formal_ratio = markers["formal_endings"] / total
        if formal_ratio > 0.7:
            markers["primary_tone"] = "전문/격식체"
        elif formal_ratio < 0.3:
            markers["primary_tone"] = "친근/구어체"
        else:
            markers["primary_tone"] = "혼합체"
    else:
        markers["primary_tone"] = "알 수 없음"

    return markers


def _analyze_structure(body: str, headings: list, image_count: int, para_count: int) -> dict:
    """글의 구조적 특성을 분석합니다."""
    lines = body.split("\n")
    non_empty = [l for l in lines if l.strip()]

    return {
        "total_chars": len(body),
        "total_lines": len(non_empty),
        "heading_count": len(headings),
        "image_count": image_count,
        "paragraph_count": para_count,
        "has_intro": any(kw in body[:200] for kw in ["안녕", "오늘", "여러분", "소개"]),
        "has_conclusion": any(kw in body[-300:] for kw in ["정리", "마무리", "결론", "도움", "감사"]),
        "uses_list": "•" in body or "- " in body or "① " in body,
        "uses_bold_headings": len(headings) >= 3,
        "avg_paragraph_length": round(len(body) / max(para_count, 1)),
    }


# ─────────────────────────────────────────────────
# 3. 스타일 가이드 생성 (AI 프롬프트 주입용)
# ─────────────────────────────────────────────────

def generate_style_guide(analyses: list[dict]) -> str:
    """
    크롤링 분석 결과를 기반으로 AI 글쓰기 프롬프트에 주입할
    스타일 가이드 텍스트를 생성합니다.

    Args:
        analyses: crawl_blog_posts()의 반환값

    Returns:
        스타일 가이드 텍스트 (프롬프트에 바로 주입 가능)
    """
    valid = [a for a in analyses if "error" not in a]
    if not valid:
        return ""

    # 평균 통계
    avg_chars = sum(a["body_full_length"] for a in valid) / len(valid)
    avg_paras = sum(a["paragraph_count"] for a in valid) / len(valid)
    avg_headings = sum(len(a["headings"]) for a in valid) / len(valid)
    avg_images = sum(a.get("image_count", 0) for a in valid) / len(valid)
    avg_sent_len = sum(a["avg_sentence_length"] for a in valid) / len(valid)

    # 톤 집계
    tone_counts = {}
    for a in valid:
        tone = a["tone_markers"].get("primary_tone", "알 수 없음")
        tone_counts[tone] = tone_counts.get(tone, 0) + 1
    dominant_tone = max(tone_counts, key=tone_counts.get)

    # 구조 패턴
    uses_list = sum(1 for a in valid if a["structure"]["uses_list"]) / len(valid)
    has_intro = sum(1 for a in valid if a["structure"]["has_intro"]) / len(valid)
    has_conclusion = sum(1 for a in valid if a["structure"]["has_conclusion"]) / len(valid)

    # 실제 소제목 예시 수집
    heading_examples = []
    for a in valid:
        heading_examples.extend(a["headings"][:3])
    heading_examples = heading_examples[:10]

    guide = f"""## 블로그 글쓰기 스타일 가이드 (참고 블로그 {len(valid)}개 분석 기반)

### 글 분량
- 평균 글자 수: 약 {int(avg_chars)}자
- 단락 수: 약 {int(avg_paras)}개
- 소제목 수: 약 {int(avg_headings)}개
- 이미지: 평균 {int(avg_images)}장

### 문장 스타일
- 주요 톤: {dominant_tone}
- 평균 문장 길이: 약 {int(avg_sent_len)}자
- {"목록(불릿/번호) 자주 사용" if uses_list > 0.5 else "목록보다는 서술형 선호"}
- {"인사/도입부 포함" if has_intro > 0.5 else "도입부 없이 바로 본론"}
- {"마무리/결론 포함" if has_conclusion > 0.5 else "결론 없이 자연스럽게 종료"}

### 소제목 예시
{chr(10).join(f"- {h}" for h in heading_examples)}

### 글쓰기 포인트
- 문장은 짧고 명확하게 ({int(avg_sent_len)}자 내외)
- 단락마다 핵심 포인트 1개씩
- 소제목으로 구간을 나눠 가독성 확보
- {"전문적이고 격식 있는 어투로 신뢰감 부여" if dominant_tone == "전문/격식체" else "친근한 어투로 독자와 거리 좁히기"}
"""
    return guide.strip()


# ─────────────────────────────────────────────────
# 4. 저장/로드 (settings DB에 캐싱)
# ─────────────────────────────────────────────────

STYLE_GUIDE_PATH = Path(settings.IMAGES_DIR).parent / "style_guide.json"


def save_style_data(analyses: list[dict], guide: str):
    """분석 결과와 스타일 가이드를 파일로 저장."""
    data = {
        "analyses": analyses,
        "guide": guide,
        "updated_at": __import__("datetime").datetime.now().isoformat(),
    }
    STYLE_GUIDE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"스타일 가이드 저장: {STYLE_GUIDE_PATH}")


def load_style_guide() -> Optional[str]:
    """저장된 스타일 가이드 로드. 없으면 None."""
    if STYLE_GUIDE_PATH.exists():
        try:
            data = json.loads(STYLE_GUIDE_PATH.read_text(encoding="utf-8"))
            return data.get("guide")
        except Exception:
            pass
    return None


def load_style_data() -> Optional[dict]:
    """저장된 전체 분석 데이터 로드."""
    if STYLE_GUIDE_PATH.exists():
        try:
            return json.loads(STYLE_GUIDE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return None
