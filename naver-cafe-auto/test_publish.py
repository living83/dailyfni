"""
발행 테스트 - headless=False (브라우저 보임)
"""
import sys, asyncio, traceback
sys.path.insert(0, "backend")

async def main():
    import database as db
    from content_generator import async_generate_content, content_to_plain_text
    from cafe_publisher import async_publish_to_cafe

    print("=== DB 계정 확인 ===")
    accounts = db.get_accounts()
    active = [a for a in accounts if a.get("active")]
    account = active[0]
    print(f"계정: {account['username']}")

    keywords = db.get_keywords()
    keywords.sort(key=lambda k: k.get("used_count", 0))
    kw = keywords[0]
    keyword_text = kw.get("text", "")
    print(f"키워드: '{keyword_text}'")

    boards = db.get_cafe_boards()
    active_boards = [b for b in boards if b.get("active", 1)]
    board = active_boards[0]
    print(f"게시판: {board.get('board_name')} | url={board.get('cafe_url')} | menu={board.get('menu_id')}")

    print("\n=== 콘텐츠 생성 중... ===")
    try:
        structured = await async_generate_content(keyword_text)
        title, content = content_to_plain_text(structured)
        print(f"✅ 제목: '{title[:50]}'")
    except Exception:
        print("❌ 콘텐츠 생성 실패:"); traceback.print_exc(); return

    print("\n=== 브라우저 띄워서 발행 실행 (headless=False) ===")
    print("-- 브라우저 창이 열립니다 --")
    try:
        result = await async_publish_to_cafe(
            account=account,
            cafe_url=board["cafe_url"],
            menu_id=board["menu_id"],
            title=title,
            sections=structured.get("sections", []),
            headless=False,  # 브라우저 보이게
        )
        print(f"\n결과: success={result.get('success')}")
        print(f"URL: {result.get('url')}")
        print(f"Error: {result.get('error')}")
    except Exception:
        print("❌ 발행 예외 발생:"); traceback.print_exc()

asyncio.run(main())
