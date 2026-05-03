"""
중복 체크 — 네이버 블로그 검색 API로 유사 포스팅 탐지
자카드 유사도 기반, 외부 라이브러리 없이 순수 Python 구현
"""

import re
import os
import sys
import html as html_module
from pathlib import Path
from typing import Optional
import httpx

# 환경변수에서 직접 읽기
NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")

# config가 있으면 거기서도 시도
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from config import settings
    if not NAVER_CLIENT_ID:
        NAVER_CLIENT_ID = settings.NAVER_CLIENT_ID
    if not NAVER_CLIENT_SECRET:
        NAVER_CLIENT_SECRET = settings.NAVER_CLIENT_SECRET
except Exception:
    pass


def _strip_html(text: str) -> str:
    """HTML 태그 제거 + 엔티티 디코딩"""
    text = re.sub(r'<[^>]+>', '', text)
    text = html_module.unescape(text)
    return text.strip()


def _tokenize(text: str) -> set[str]:
    """텍스트를 2-gram + 단어 토큰으로 분리"""
    text = text.lower()
    # 한글, 영문, 숫자만 남기고 공백으로 분리
    text = re.sub(r'[^\w\s가-힣]', ' ', text)
    words = text.split()

    tokens = set(words)
    # 2-gram 추가 (연속 2단어)
    for i in range(len(words) - 1):
        tokens.add(f"{words[i]}_{words[i+1]}")
    # 문자 3-gram (한글 유사도 향상)
    clean = re.sub(r'\s+', '', text)
    for i in range(len(clean) - 2):
        tokens.add(clean[i:i+3])

    return tokens


def _jaccard_similarity(text_a: str, text_b: str) -> float:
    """자카드 유사도 계산 (0~100)"""
    set_a = _tokenize(text_a)
    set_b = _tokenize(text_b)

    if not set_a or not set_b:
        return 0.0

    intersection = set_a & set_b
    union = set_a | set_b

    return round((len(intersection) / len(union)) * 100, 1)


async def check_duplicate(title: str, keywords: Optional[list[str]] = None) -> dict:
    """
    네이버 블로그 검색 API로 유사 포스팅 탐지

    Args:
        title: 포스팅 제목
        keywords: 핵심 키워드 리스트 (없으면 제목 사용)

    Returns:
        {
            max_similarity: float,
            results: [{title, link, similarity}],
            warning: bool,
            message: str
        }
    """
    client_id = NAVER_CLIENT_ID
    client_secret = NAVER_CLIENT_SECRET

    if not client_id or not client_secret:
        return {
            "max_similarity": 0,
            "results": [],
            "warning": False,
            "message": "네이버 API 키가 설정되지 않았습니다. .env 파일에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET을 설정하세요."
        }

    # 검색어: 키워드 우선, 없으면 제목 사용
    query = " ".join(keywords) if keywords else title

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://openapi.naver.com/v1/search/blog.json",
                params={"query": query, "display": 10, "sort": "sim"},
                headers={
                    "X-Naver-Client-Id": client_id,
                    "X-Naver-Client-Secret": client_secret,
                },
            )

        if res.status_code != 200:
            return {
                "max_similarity": 0,
                "results": [],
                "warning": False,
                "message": f"네이버 API 오류: {res.status_code} — {res.text[:200]}"
            }

        data = res.json()
        items = data.get("items", [])

        results = []
        input_text = f"{title} {' '.join(keywords or [])}"

        for item in items:
            item_title = _strip_html(item.get("title", ""))
            item_desc = _strip_html(item.get("description", ""))
            compare_text = f"{item_title} {item_desc}"

            similarity = _jaccard_similarity(input_text, compare_text)

            results.append({
                "title": item_title,
                "link": item.get("link", ""),
                "description": item_desc[:100],
                "similarity": similarity,
            })

        # 유사도 내림차순 정렬
        results.sort(key=lambda x: x["similarity"], reverse=True)
        max_sim = results[0]["similarity"] if results else 0

        warning = max_sim >= 70
        if warning:
            message = f"유사 포스팅이 존재합니다 (최대 {max_sim}%). 제목 수정을 권장합니다."
        elif max_sim >= 50:
            message = f"일부 유사한 포스팅이 있습니다 ({max_sim}%). 차별화된 내용을 추가하세요."
        else:
            message = f"유사 포스팅이 거의 없습니다 ({max_sim}%). 발행 가능합니다."

        return {
            "max_similarity": max_sim,
            "results": results,
            "warning": warning,
            "message": message,
        }

    except httpx.TimeoutException:
        return {
            "max_similarity": 0,
            "results": [],
            "warning": False,
            "message": "네이버 API 요청 시간 초과"
        }
    except Exception as e:
        return {
            "max_similarity": 0,
            "results": [],
            "warning": False,
            "message": f"중복 체크 오류: {str(e)}"
        }
