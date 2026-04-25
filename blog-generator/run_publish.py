"""
CLI 테스트 — 단일 포스트 발행
Usage: python run_publish.py --naver-id xxx --naver-pw yyy --title "제목" --content "본문"
"""
import asyncio
import argparse
import sys
from loguru import logger
from browser.publisher import publish_single_post

async def main():
    parser = argparse.ArgumentParser(description="Naver Blog 단일 포스트 발행 테스트")
    parser.add_argument("--naver-id", required=True, help="네이버 ID")
    parser.add_argument("--naver-pw", required=True, help="네이버 비밀번호")
    parser.add_argument("--title", default="테스트 포스트", help="글 제목")
    parser.add_argument("--content", default="이것은 테스트 포스팅입니다.", help="글 내용")
    parser.add_argument("--tags", default="테스트,자동화", help="태그 (쉼표 구분)")
    parser.add_argument("--headless", action="store_true", help="헤드리스 모드")
    args = parser.parse_args()

    account = {
        "id": "test",
        "account_name": "테스트계정",
        "naver_id": args.naver_id,
        "naver_password": args.naver_pw,
    }
    post_data = {
        "title": args.title,
        "content": args.content,
        "keywords": args.tags.split(","),
        "keyword": args.title[:20],
        "post_type": "general",
    }

    logger.info(f"발행 시작: {args.title}")
    result = await publish_single_post(account, post_data)

    if result["success"]:
        logger.info(f"발행 성공! URL: {result['url']}")
    else:
        logger.error(f"발행 실패: {result['error']}")

    return result

if __name__ == "__main__":
    asyncio.run(main())
