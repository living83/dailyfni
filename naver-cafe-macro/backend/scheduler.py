"""
scheduler.py - 스케줄러 & 저품질 방지 로직
APScheduler 기반 자동 발행 관리

저품질 방지 전략:
1. 교차 발행: 같은 카페 연속 발행 금지 (다른 카페와 교차)
2. 계정 간 간격: 같은 계정 최소 2~4시간 대기
3. 랜덤 딜레이: 스케줄 시간에 랜덤 오프셋 추가
4. 타이핑 딜레이: cafe_publisher의 human_type으로 처리
"""

import random
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import database as db
from cafe_publisher import publish_to_cafe, post_comment
from content_generator import generate_content, content_to_plain_text
from crypto import decrypt_password

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# 상태 관리
_is_running = False
_last_published_cafe = None  # 마지막 발행 카페 URL (교차 발행용)
_publish_queue = []  # 발행 큐
_progress_callbacks = []  # SSE 진행 상태 콜백


def register_progress_callback(callback):
    _progress_callbacks.append(callback)


def unregister_progress_callback(callback):
    if callback in _progress_callbacks:
        _progress_callbacks.remove(callback)


async def _notify_progress(event: str, data: dict):
    for cb in _progress_callbacks:
        try:
            await cb(event, data)
        except Exception:
            pass


# ─── 저품질 방지 로직 ─────────────────────────────────────

def _get_eligible_accounts(config: dict) -> list:
    """
    발행 가능한 계정 목록 반환
    - 활성 상태인 계정
    - 최소 대기 시간(account_interval_hours) 경과한 계정
    """
    accounts = db.get_accounts()
    active_accounts = [a for a in accounts if a["active"]]

    interval_hours = config.get("account_interval_hours", 3)
    now = datetime.now()

    eligible = []
    for acc in active_accounts:
        if acc["last_published_at"]:
            last_pub = datetime.fromisoformat(acc["last_published_at"])
            # 최소 interval_hours 시간 경과 필요, ±30분 랜덤
            jitter_minutes = random.randint(-30, 30)
            min_wait = timedelta(hours=interval_hours, minutes=jitter_minutes)
            if now - last_pub < min_wait:
                continue
        eligible.append(acc)

    return eligible


def _get_next_board(keyword_id: int = None) -> Optional[dict]:
    """
    교차 발행 로직:
    - keyword_id가 있으면 매핑된 게시판에서만 선택
    - 같은 카페 연속 발행 금지
    - 가장 오래 전에 발행한 게시판 우선
    """
    global _last_published_cafe

    if keyword_id:
        active_boards = db.get_boards_for_keyword(keyword_id)
    else:
        boards = db.get_cafe_boards()
        active_boards = [b for b in boards if b.get("active", 1)]

    if not active_boards:
        return None

    # 같은 카페가 아닌 게시판 우선
    if _last_published_cafe:
        diff_cafe = [b for b in active_boards if b["cafe_url"] != _last_published_cafe]
        if diff_cafe:
            active_boards = diff_cafe

    # 가장 오래 전에 발행한 게시판 우선 (last_published_at 기준)
    def sort_key(b):
        if not b.get("last_published_at"):
            return datetime.min
        return datetime.fromisoformat(b["last_published_at"])

    active_boards.sort(key=sort_key)
    return active_boards[0]


def _get_next_keyword(config: dict = None) -> Optional[dict]:
    """키워드 순환: 최소 사용 우선"""
    keywords = db.get_keywords()
    if not keywords:
        return None

    # used_count가 가장 적은 키워드 우선
    keywords.sort(key=lambda k: (k["used_count"], random.random()))
    return keywords[0]


def _select_comment_accounts(
    all_accounts: list,
    author_id: int,
    count: int,
    order: str = "random",
    exclude_author: bool = True
) -> list:
    """댓글 작성할 계정 선택"""
    pool = [a for a in all_accounts if a["active"]]
    if exclude_author:
        pool = [a for a in pool if a["id"] != author_id]

    if not pool:
        return []

    if order == "random":
        random.shuffle(pool)
    elif order == "round":
        pass  # 순서대로
    elif order == "least":
        pool.sort(key=lambda a: a.get("used_count", 0))

    # count보다 pool이 적으면 중복 허용
    selected = []
    while len(selected) < count and pool:
        selected.extend(pool)
    return selected[:count]


# ─── 발행 작업 ─────────────────────────────────────────────

async def execute_publish_job():
    """단일 발행 작업 실행"""
    global _last_published_cafe

    if not _is_running:
        return

    config = db.get_schedule_config()

    # 1. 오늘 요일 체크
    today_dow = datetime.now().weekday()  # 0=월 ~ 6=일
    days = config.get("days", "1,1,1,1,1,0,0").split(",")
    if len(days) > today_dow and days[today_dow] == "0":
        logger.info(f"오늘은 발행하지 않는 요일 (dow={today_dow})")
        return

    # 2. 발행 가능한 계정 선택
    eligible = _get_eligible_accounts(config)
    if not eligible:
        logger.info("발행 가능한 계정 없음 (대기 시간 미충족)")
        await _notify_progress("info", {"message": "발행 가능한 계정 없음 - 대기 시간 미충족"})
        return

    account = random.choice(eligible)

    # 3. 키워드 선택 (먼저 선택 → 매핑된 게시판 결정)
    keyword = _get_next_keyword(config)
    if not keyword:
        logger.info("등록된 키워드 없음")
        await _notify_progress("info", {"message": "등록된 키워드가 없습니다"})
        return

    # 4. 게시판 선택 (키워드에 매핑된 게시판 중 교차 발행)
    board = _get_next_board(keyword_id=keyword["id"])
    if not board:
        logger.info(f"키워드 '{keyword['text']}'에 매핑된 활성 게시판 없음")
        await _notify_progress("info", {"message": f"키워드 '{keyword['text']}'에 매핑된 게시판이 없습니다"})
        return

    # 5. 랜덤 딜레이
    delay_min = config.get("random_delay_min", 10)
    delay_max = config.get("random_delay_max", 120)
    delay = random.randint(delay_min, delay_max)
    logger.info(f"랜덤 딜레이: {delay}초")
    await _notify_progress("delay", {"message": f"랜덤 딜레이 {delay}초 대기 중...", "seconds": delay})
    await asyncio.sleep(delay)

    if not _is_running:
        return

    # 6. 글 제목/내용 생성 (글2 템플릿 기반)
    structured = generate_content(keyword["text"])
    title, content = content_to_plain_text(structured)

    # 7. DB에 발행 기록 생성
    publish_id = db.add_publish_record(
        keyword["id"], board["id"], account["id"], title, content
    )

    await _notify_progress("publishing", {
        "message": f"발행 중: {account['username']} → {board['board_name']}",
        "account": account["username"],
        "board": board["board_name"],
        "keyword": keyword["text"],
        "publish_id": publish_id
    })

    # 8. 발행 실행
    def on_publish_progress(step, msg):
        logger.info(f"[{account['username']}] {step}: {msg}")

    result = await asyncio.to_thread(
        publish_to_cafe,
        account=account,
        cafe_url=board["cafe_url"],
        menu_id=board["menu_id"],
        title=title,
        content=content,
        headless=True,
        on_progress=on_publish_progress,
        structured_content=structured
    )

    # 9. 결과 처리
    if result["success"]:
        db.update_publish_status(publish_id, "성공", result["url"])
        db.update_account_last_published(account["id"])
        db.update_board_last_published(board["id"])
        db.increment_keyword_usage(keyword["id"])
        _last_published_cafe = board["cafe_url"]

        if result.get("cookies"):
            db.update_account_cookie(account["id"], result["cookies"])

        await _notify_progress("published", {
            "message": f"발행 성공: {result['url']}",
            "publish_id": publish_id,
            "url": result["url"]
        })

        # 10. 댓글 자동 작성
        if config.get("comment_enabled"):
            await execute_comment_job(
                publish_id=publish_id,
                post_url=result["url"],
                author_id=account["id"],
                config=config,
                keyword_id=keyword["id"]
            )
    else:
        db.update_publish_status(publish_id, "실패", error_message=result.get("error"))
        await _notify_progress("error", {
            "message": f"발행 실패: {result.get('error')}",
            "publish_id": publish_id
        })

    logger.info(f"발행 완료: {account['username']} → {board['cafe_url']}/{board['board_name']} "
                f"결과={'성공' if result['success'] else '실패'}")


async def execute_comment_job(
    publish_id: int,
    post_url: str,
    author_id: int,
    config: dict,
    keyword_id: int = None
):
    """발행 후 댓글 자동 작성 (키워드에 매핑된 템플릿 우선 사용)"""
    comments_per_post = config.get("comments_per_post", 6)
    comment_delay_min = config.get("comment_delay_min", 60)
    comment_delay_max = config.get("comment_delay_max", 300)
    comment_order = config.get("comment_order", "random")
    exclude_author = bool(config.get("exclude_author", 1))

    all_accounts = db.get_accounts()

    # 키워드에 매핑된 템플릿 사용 (매핑 없으면 전체 활성 템플릿)
    if keyword_id:
        active_templates = db.get_comments_for_keyword(keyword_id)
    else:
        templates = db.get_comment_templates()
        active_templates = [t for t in templates if t["active"]]

    if not active_templates:
        logger.info("활성 댓글 템플릿 없음")
        return

    # 댓글 작성 계정 선택
    comment_accounts = _select_comment_accounts(
        all_accounts, author_id, comments_per_post, comment_order, exclude_author
    )

    for i, acc in enumerate(comment_accounts):
        if not _is_running:
            break

        # 랜덤 템플릿 선택
        template = random.choice(active_templates)
        comment_text = template["text"]

        # 댓글 기록 생성
        comment_id = db.add_comment_record(publish_id, acc["id"], template["id"])

        await _notify_progress("commenting", {
            "message": f"댓글 #{i+1}/{comments_per_post}: {acc['username']}",
            "publish_id": publish_id,
            "comment_index": i + 1,
            "account": acc["username"]
        })

        # 댓글 작성
        result = await asyncio.to_thread(
            post_comment,
            account=acc,
            post_url=post_url,
            comment_text=comment_text,
            headless=True
        )

        if result["success"]:
            db.update_comment_status(comment_id, "성공")
            if result.get("cookies"):
                db.update_account_cookie(acc["id"], result["cookies"])
        else:
            db.update_comment_status(comment_id, "실패", result.get("error"))

        # 댓글 간 딜레이
        if i < len(comment_accounts) - 1:
            delay = random.randint(comment_delay_min, comment_delay_max)
            logger.info(f"댓글 딜레이: {delay}초")
            await asyncio.sleep(delay)


# ─── 스케줄러 시작/정지 ────────────────────────────────────

def build_cron_triggers(config: dict) -> list:
    """스케줄 설정으로부터 CronTrigger 목록 생성"""
    times_str = config.get("times", "09:00,14:00,19:00")
    times = [t.strip() for t in times_str.split(",") if t.strip()]

    days_str = config.get("days", "1,1,1,1,1,0,0")
    days_list = days_str.split(",")

    # APScheduler day_of_week: mon=0 ... sun=6
    dow_names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    active_days = [dow_names[i] for i, d in enumerate(days_list) if d == "1"]
    if not active_days:
        active_days = ["mon", "tue", "wed", "thu", "fri"]

    dow_str = ",".join(active_days)

    triggers = []
    for t in times:
        try:
            hour, minute = t.split(":")
            triggers.append(CronTrigger(
                day_of_week=dow_str,
                hour=int(hour),
                minute=int(minute)
            ))
        except ValueError:
            logger.warning(f"잘못된 시간 형식: {t}")

    return triggers


async def start_scheduler():
    """스케줄러 시작"""
    global _is_running

    if _is_running:
        logger.info("스케줄러가 이미 실행 중")
        return

    config = db.get_schedule_config()
    triggers = build_cron_triggers(config)

    # 기존 작업 제거
    scheduler.remove_all_jobs()

    # 각 시간대에 발행 작업 등록
    for i, trigger in enumerate(triggers):
        scheduler.add_job(
            execute_publish_job,
            trigger=trigger,
            id=f"publish_job_{i}",
            replace_existing=True
        )

    if not scheduler.running:
        scheduler.start()

    _is_running = True
    logger.info(f"스케줄러 시작됨 ({len(triggers)}개 시간대)")
    await _notify_progress("scheduler", {"message": "스케줄러 시작됨", "running": True})


async def stop_scheduler():
    """스케줄러 중지"""
    global _is_running
    _is_running = False
    scheduler.remove_all_jobs()
    logger.info("스케줄러 중지됨")
    await _notify_progress("scheduler", {"message": "스케줄러 중지됨", "running": False})


async def reload_scheduler():
    """스케줄 설정 변경 시 재시작"""
    if _is_running:
        await stop_scheduler()
        await start_scheduler()


def is_running() -> bool:
    return _is_running


async def run_once_now():
    """즉시 1회 발행 (테스트/수동 실행용)"""
    global _is_running
    was_running = _is_running
    _is_running = True
    await execute_publish_job()
    if not was_running:
        _is_running = False
