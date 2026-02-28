"""
scheduler.py - 스케줄러 & 저품질 방지 로직
APScheduler 기반 자동 발행 관리

배치 발행 전략:
1. 매일 1회 배치: base_start_hour:minute 에 시작, 일별 daily_shift_minutes 만큼 지연
2. 최대 max_accounts_per_run 개 계정이 interval_min 분 간격으로 순차 발행
3. 교차 발행: 같은 카페 연속 발행 금지 (다른 카페와 교차)
4. 계정 간 간격: 같은 계정 최소 account_interval_hours 시간 대기
5. 랜덤 딜레이: 각 발행 전 랜덤 오프셋 추가
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


def _calc_match_score(keyword_text: str, board_name: str) -> int:
    """
    키워드 텍스트와 게시판 이름 간 매칭 점수 계산.
    - 완전 포함: 높은 점수 (길이 × 10)
    - 부분 매칭: 가장 긴 공통 부분문자열 길이
    - 최소 2글자 이상 매칭 필요
    """
    # 게시판 이름이 키워드에 포함 (예: 게시판 "자동차" ⊂ 키워드 "자동차할부")
    if board_name in keyword_text:
        return len(board_name) * 10

    # 키워드가 게시판 이름에 포함 (예: 키워드 "자동차할부" ⊂ 게시판 "자동차할부대출")
    if keyword_text in board_name:
        return len(keyword_text) * 10

    # 부분 매칭: 가장 긴 공통 부분문자열
    shorter = board_name if len(board_name) <= len(keyword_text) else keyword_text
    longer = keyword_text if shorter == board_name else board_name

    for length in range(len(shorter), 1, -1):
        for start in range(len(shorter) - length + 1):
            sub = shorter[start:start + length]
            if sub in longer:
                return length

    return 0


def _match_boards_by_keyword(keyword_text: str, boards: list) -> list:
    """
    키워드 텍스트로 게시판 이름 자동 매칭.
    최소 2글자 이상 매칭, 최고 점수 게시판만 반환.
    """
    scored = []
    for board in boards:
        name = board["board_name"]
        score = _calc_match_score(keyword_text, name)
        if score >= 2:
            scored.append((board, score))
            logger.debug(f"게시판 매칭: '{keyword_text}' ↔ '{name}' = {score}점")

    if not scored:
        return []

    scored.sort(key=lambda x: x[1], reverse=True)
    best_score = scored[0][1]
    result = [b for b, s in scored if s == best_score]

    logger.info(f"키워드 '{keyword_text}' → 자동 매칭 게시판: "
                f"{[b['board_name'] for b in result]} (점수: {best_score})")
    return result


def _get_next_board(keyword_id: int = None, keyword_text: str = "") -> Optional[dict]:
    """
    교차 발행 로직:
    1. keyword_id에 명시적 게시판 매핑이 있으면 해당 게시판만 사용
    2. 매핑 없으면 keyword_text로 게시판 이름 자동 매칭
    3. 자동 매칭도 없으면 전체 활성 게시판 사용
    4. 같은 카페 연속 발행 금지
    5. 가장 오래 전에 발행한 게시판 우선
    """
    global _last_published_cafe

    if keyword_id:
        # 명시적 keyword-board 매핑 확인
        explicit_ids = db.get_keyword_boards(keyword_id)
        if explicit_ids:
            active_boards = db.get_boards_for_keyword(keyword_id)
            logger.info(f"키워드 ID {keyword_id}: 명시적 매핑 게시판 {len(active_boards)}개")
        else:
            # 매핑 없음 → 키워드 텍스트로 자동 매칭
            boards = db.get_cafe_boards()
            all_active = [b for b in boards if b.get("active", 1)]

            if keyword_text and all_active:
                matched = _match_boards_by_keyword(keyword_text, all_active)
                if matched:
                    active_boards = matched
                else:
                    logger.info(f"키워드 '{keyword_text}': 자동 매칭 실패 → 전체 게시판 사용")
                    active_boards = all_active
            else:
                active_boards = all_active
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

    # 한 글에 같은 계정이 중복 댓글 불가 — 계정 수까지만
    return pool[:count]


def _calc_daily_offset_minutes(config: dict) -> int:
    """
    일별 지연 오프셋 계산
    - daily_shift_minutes 만큼 매일 시작 시각이 밀림
    - 최대 4시간 범위 내에서 순환 (8일 주기 @ 30분 지연)
    """
    daily_shift = config.get("daily_shift_minutes", 30)
    if daily_shift <= 0:
        return 0

    day_index = datetime.now().timetuple().tm_yday  # 1~366 (연 기준)
    max_shift = 4 * 60  # 최대 4시간 (240분)
    cycle = max(1, max_shift // max(1, daily_shift))
    return (day_index % cycle) * daily_shift


# ─── 단일 계정 발행 ──────────────────────────────────────────

async def _publish_single(account: dict, config: dict, skip_comment: bool = False):
    """단일 계정으로 1건 발행 (키워드 선택 → 게시판 선택 → 발행 → 댓글)

    Args:
        skip_comment: True이면 댓글 작성 건너뜀 (1회 수동 실행용)
    """
    global _last_published_cafe

    # 1. 키워드 선택
    keyword = _get_next_keyword(config)
    if not keyword:
        logger.info("등록된 키워드 없음")
        await _notify_progress("info", {"message": "등록된 키워드가 없습니다"})
        return

    # 2. 게시판 선택 (명시적 매핑 → 키워드 텍스트 자동 매칭 → 전체 게시판)
    board = _get_next_board(keyword_id=keyword["id"], keyword_text=keyword["text"])
    if not board:
        logger.info(f"키워드 '{keyword['text']}'에 매핑된 활성 게시판 없음")
        await _notify_progress("info", {"message": f"키워드 '{keyword['text']}'에 매핑된 게시판이 없습니다"})
        return

    # 3. 랜덤 딜레이
    delay_min = config.get("random_delay_min", 10)
    delay_max = config.get("random_delay_max", 120)
    delay = random.randint(delay_min, delay_max)
    logger.info(f"랜덤 딜레이: {delay}초")
    await _notify_progress("delay", {"message": f"랜덤 딜레이 {delay}초 대기 중...", "seconds": delay})
    await asyncio.sleep(delay)

    if not _is_running:
        return

    # 4. 글 제목/내용 생성
    structured = generate_content(keyword["text"])
    title, content = content_to_plain_text(structured)

    # 5. DB에 발행 기록 생성
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

    # 6. 발행 실행
    def on_publish_progress(step, msg):
        logger.info(f"[{account['username']}] {step}: {msg}")

    result = await asyncio.to_thread(
        publish_to_cafe,
        account=account,
        cafe_url=board["cafe_url"],
        menu_id=board["menu_id"],
        board_name=board.get("board_name", ""),
        title=title,
        content=content,
        headless=True,
        on_progress=on_publish_progress,
        structured_content=structured
    )

    # 7. 결과 처리
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

        # 댓글 자동 작성 (1회 수동 실행에서는 건너뜀)
        if not skip_comment and config.get("comment_enabled"):
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


# ─── 배치 발행 작업 ──────────────────────────────────────────

async def execute_batch_job():
    """
    일일 배치 발행 작업 (스케줄러가 호출)
    - 일별 지연 오프셋만큼 대기 후
    - 최대 max_accounts_per_run 개 계정이 interval_min 분 간격으로 순차 발행
    """
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

    # 2. 일별 지연 오프셋 대기
    offset_minutes = _calc_daily_offset_minutes(config)
    if offset_minutes > 0:
        base_h = config.get("base_start_hour", 8)
        base_m = config.get("base_start_minute", 0)
        actual_total = base_h * 60 + base_m + offset_minutes
        actual_h = (actual_total // 60) % 24
        actual_m = actual_total % 60
        logger.info(f"일별 지연: {offset_minutes}분 대기 (오늘 시작: {actual_h:02d}:{actual_m:02d})")
        await _notify_progress("delay", {
            "message": f"일별 지연 {offset_minutes}분 대기 중... (오늘 시작: {actual_h:02d}:{actual_m:02d})",
            "seconds": offset_minutes * 60
        })
        await asyncio.sleep(offset_minutes * 60)

    if not _is_running:
        return

    # 3. 발행 가능한 계정 선택 (최대 max_accounts_per_run)
    max_accounts = config.get("max_accounts_per_run", 30)
    eligible = _get_eligible_accounts(config)
    random.shuffle(eligible)
    batch = eligible[:max_accounts]

    if not batch:
        logger.info("발행 가능한 계정 없음 (대기 시간 미충족)")
        await _notify_progress("info", {"message": "발행 가능한 계정 없음 - 대기 시간 미충족"})
        return

    interval = config.get("interval_min", 5)
    total = len(batch)

    logger.info(f"배치 발행 시작: {total}개 계정, {interval}분 간격")
    await _notify_progress("batch_start", {
        "message": f"배치 발행 시작: {total}개 계정, {interval}분 간격",
        "total_accounts": total,
        "interval_min": interval
    })

    # 4. 순차 발행: 계정마다 interval_min 분 간격 유지
    success_count = 0
    fail_count = 0

    for i, account in enumerate(batch):
        if not _is_running:
            logger.info("스케줄러 중지됨 - 배치 중단")
            break

        turn_start = datetime.now()

        await _notify_progress("batch_progress", {
            "message": f"[{i+1}/{total}] {account['username']} 발행 시작",
            "current": i + 1,
            "total": total,
            "account": account["username"]
        })

        try:
            await _publish_single(account, config)
            success_count += 1
        except Exception as e:
            fail_count += 1
            logger.error(f"[{account['username']}] 발행 중 예외: {e}")
            await _notify_progress("error", {
                "message": f"[{account['username']}] 발행 예외: {str(e)}"
            })

        # 마지막 계정이 아니면 interval_min 간격 맞추기
        if i < total - 1 and _is_running:
            elapsed = (datetime.now() - turn_start).total_seconds()
            remaining = interval * 60 - elapsed
            if remaining > 0:
                logger.info(f"다음 계정까지 {remaining:.0f}초 대기 ({i+2}/{total})")
                await _notify_progress("delay", {
                    "message": f"다음 계정까지 {remaining:.0f}초 대기 ({i+2}/{total})",
                    "seconds": remaining
                })
                await asyncio.sleep(remaining)

    logger.info(f"배치 발행 완료: 성공 {success_count}, 실패 {fail_count}")
    await _notify_progress("batch_complete", {
        "message": f"배치 발행 완료: 성공 {success_count}, 실패 {fail_count}",
        "success": success_count,
        "fail": fail_count,
        "total": total
    })


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

def build_cron_trigger(config: dict) -> CronTrigger:
    """스케줄 설정으로부터 일일 1회 CronTrigger 생성 (base_start_hour:minute)"""
    days_str = config.get("days", "1,1,1,1,1,0,0")
    days_list = days_str.split(",")

    # APScheduler day_of_week: mon=0 ... sun=6
    dow_names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    active_days = [dow_names[i] for i, d in enumerate(days_list) if d == "1"]
    if not active_days:
        active_days = ["mon", "tue", "wed", "thu", "fri"]

    dow_str = ",".join(active_days)
    hour = config.get("base_start_hour", 8)
    minute = config.get("base_start_minute", 0)

    return CronTrigger(day_of_week=dow_str, hour=hour, minute=minute)


async def start_scheduler():
    """스케줄러 시작"""
    global _is_running

    if _is_running:
        logger.info("스케줄러가 이미 실행 중")
        return

    config = db.get_schedule_config()
    trigger = build_cron_trigger(config)

    # 기존 작업 제거
    scheduler.remove_all_jobs()

    # 일일 배치 발행 작업 등록
    scheduler.add_job(
        execute_batch_job,
        trigger=trigger,
        id="batch_publish_job",
        replace_existing=True
    )

    if not scheduler.running:
        scheduler.start()

    _is_running = True

    offset = _calc_daily_offset_minutes(config)
    base_h = config.get("base_start_hour", 8)
    base_m = config.get("base_start_minute", 0)
    total = base_h * 60 + base_m + offset
    actual_h = (total // 60) % 24
    actual_m = total % 60

    logger.info(f"스케줄러 시작됨 (기본 {base_h:02d}:{base_m:02d}, 오늘 시작: {actual_h:02d}:{actual_m:02d})")
    await _notify_progress("scheduler", {
        "message": f"스케줄러 시작됨 (오늘 시작: {actual_h:02d}:{actual_m:02d})",
        "running": True
    })


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
    """즉시 1회 발행 (테스트/수동 실행용) - 1개 계정으로 1건만 발행"""
    global _is_running
    was_running = _is_running
    _is_running = True

    config = db.get_schedule_config()
    eligible = _get_eligible_accounts(config)

    if not eligible:
        # 대기 시간 미충족이면 활성 계정 중 아무나 선택
        accounts = db.get_accounts()
        eligible = [a for a in accounts if a["active"]]

    if eligible:
        account = random.choice(eligible)
        await _notify_progress("info", {"message": f"수동 1회 발행: {account['username']}"})
        await _publish_single(account, config, skip_comment=True)
    else:
        await _notify_progress("error", {"message": "활성 계정이 없습니다"})

    if not was_running:
        _is_running = False
