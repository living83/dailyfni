"""
댓글 로직 테스트
1. DB 상태 확인 (계정, 댓글 템플릿, 최근 발행 기록)
2. 실제 댓글 작성 시도 (headless=False)
"""
import sys, asyncio, traceback
sys.path.insert(0, "backend")

async def main():
    import database as db
    from cafe_publisher import async_post_comment

    print("=== [1] DB 계정 확인 ===")
    accounts = db.get_accounts()
    active = [a for a in accounts if a.get("active")]
    if not active:
        print("❌ 활성 계정 없음"); return
    account = active[0]
    print(f"  계정: {account['username']} (id={account['id']})")

    print("\n=== [2] 댓글 템플릿 확인 ===")
    templates = db.get_comment_templates()
    active_tpl = [t for t in templates if t.get("active", 1)]
    print(f"  전체 템플릿: {len(templates)}개 / 활성: {len(active_tpl)}개")
    if active_tpl:
        print(f"  샘플: \"{active_tpl[0]['text'][:50]}\"")
    else:
        print("❌ 활성 댓글 템플릿 없음"); return

    print("\n=== [3] 최근 발행 기록 확인 ===")
    history = db.get_publish_history(limit=5)
    success_posts = [h for h in history if h.get("status") == "성공" and h.get("published_url")]
    if not success_posts:
        print("❌ 성공한 발행 기록 없음 - 발행 먼저 실행 필요")
        # URL 직접 입력으로 테스트
        post_url = input("\n  테스트할 카페 글 URL 직접 입력 (엔터=건너뜀): ").strip()
        if not post_url:
            print("  건너뜀"); return
    else:
        post = success_posts[0]
        post_url = post["published_url"]
        print(f"  최근 발행: [{post['status']}] {post['title'][:30]}")
        print(f"  URL: {post_url}")

    comment_text = active_tpl[0]["text"]
    print(f"\n=== [4] 댓글 작성 시도 ===")
    print(f"  URL: {post_url}")
    print(f"  댓글: \"{comment_text[:40]}\"")
    print("  브라우저 창이 열립니다...")

    try:
        result = await async_post_comment(
            account=account,
            post_url=post_url,
            comment_text=comment_text,
            headless=False,
        )
        if result["success"]:
            print(f"✅ 댓글 작성 성공!")
        else:
            print(f"❌ 댓글 작성 실패: {result.get('error')}")
    except Exception:
        print("❌ 예외 발생:")
        traceback.print_exc()

asyncio.run(main())
