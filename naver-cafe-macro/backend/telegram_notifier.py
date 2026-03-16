"""
telegram_notifier.py - 텔레그램 알림 모듈
발행 성공/실패, 배치 완료 알림을 텔레그램으로 전송
"""

import asyncio
import logging
import urllib.request
import urllib.parse
import json

import database as db

logger = logging.getLogger("scheduler")


def get_telegram_config() -> dict:
    """텔레그램 설정 조회"""
    conn = db.get_connection()
    row = conn.execute("SELECT * FROM telegram_config WHERE id = 1").fetchone()
    conn.close()
    if row:
        cfg = dict(row)
        # bot_token 마스킹 여부는 호출자가 결정
        return cfg
    return {
        "id": 1, "bot_token": "", "chat_id": "",
        "enabled": 0, "notify_success": 1,
        "notify_failure": 1, "notify_batch_summary": 1,
    }


def update_telegram_config(**kwargs):
    """텔레그램 설정 업데이트"""
    allowed = [
        "bot_token", "chat_id", "enabled",
        "notify_success", "notify_failure", "notify_batch_summary",
    ]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return
    conn = db.get_connection()
    try:
        # upsert
        conn.execute("INSERT OR IGNORE INTO telegram_config (id) VALUES (1)")
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE telegram_config SET {set_clause} WHERE id = 1",
                     list(updates.values()))
        conn.commit()
    except Exception as e:
        logger.error(f"텔레그램 설정 DB 저장 실패: {e}", exc_info=True)
        raise
    finally:
        conn.close()


def _send_sync(bot_token: str, chat_id: str, text: str) -> dict:
    """동기 HTTP 요청으로 텔레그램 메시지 전송 (스레드에서 실행)"""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    data = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true",
    }).encode("utf-8")

    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return {"ok": True, "result": body}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def send_message(text: str) -> dict:
    """텔레그램 메시지 비동기 전송"""
    config = get_telegram_config()
    if not config.get("enabled"):
        return {"ok": False, "error": "텔레그램 알림 비활성"}
    bot_token = config.get("bot_token", "").strip()
    chat_id = config.get("chat_id", "").strip()
    if not bot_token or not chat_id:
        return {"ok": False, "error": "봇 토큰 또는 채팅 ID 미설정"}

    return await asyncio.to_thread(_send_sync, bot_token, chat_id, text)


async def send_test_message() -> dict:
    """테스트 메시지 전송 (enabled 여부 무관하게 전송)"""
    config = get_telegram_config()
    bot_token = config.get("bot_token", "").strip()
    chat_id = config.get("chat_id", "").strip()
    if not bot_token or not chat_id:
        return {"ok": False, "error": "봇 토큰 또는 채팅 ID 미설정"}
    return await asyncio.to_thread(
        _send_sync, bot_token, chat_id,
        "✅ DailyFNI 카페 매크로 텔레그램 알림 테스트 메시지입니다."
    )


async def notify_publish_success(account: str, board: str, keyword: str, url: str):
    """발행 성공 알림"""
    config = get_telegram_config()
    if not config.get("enabled") or not config.get("notify_success"):
        return
    text = (
        f"<b>발행 성공</b>\n"
        f"계정: {account}\n"
        f"게시판: {board}\n"
        f"키워드: {keyword}\n"
        f"URL: {url}"
    )
    result = await send_message(text)
    if not result.get("ok"):
        logger.warning(f"텔레그램 성공 알림 실패: {result.get('error')}")


async def notify_publish_failure(account: str, board: str, keyword: str, error: str):
    """발행 실패 알림"""
    config = get_telegram_config()
    if not config.get("enabled") or not config.get("notify_failure"):
        return
    text = (
        f"<b>발행 실패</b>\n"
        f"계정: {account}\n"
        f"게시판: {board}\n"
        f"키워드: {keyword}\n"
        f"오류: {error}"
    )
    result = await send_message(text)
    if not result.get("ok"):
        logger.warning(f"텔레그램 실패 알림 실패: {result.get('error')}")


async def notify_batch_complete(success: int, fail: int, total: int):
    """배치 완료 요약 알림"""
    config = get_telegram_config()
    if not config.get("enabled") or not config.get("notify_batch_summary"):
        return
    text = (
        f"<b>배치 발행 완료</b>\n"
        f"성공: {success}건\n"
        f"실패: {fail}건\n"
        f"전체: {total}건"
    )
    result = await send_message(text)
    if not result.get("ok"):
        logger.warning(f"텔레그램 배치 알림 실패: {result.get('error')}")
