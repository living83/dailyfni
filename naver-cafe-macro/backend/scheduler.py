"""
scheduler.py - 스케줄러 & 저품질 방지 로직
APScheduler 기반 자동 발행 관리

배치 발행 전략:
1. 매일 1회 배치: base_start_hour:minute 에 시작, 일별 daily_shift_minutes 만큼 지연
2. 카페별 독립 설정: 각 카페의 interval, 일일 한도, 댓글 설정 사용
3. 교차 발행: 카페 간 교차하여 같은 카페 연속 발행 금지
4. 계정 간 간격: 같은 계정 같은 카페에 최소 account_interval_hours 시간 대기 (카페별 독립)
5. 랜덤 딜레이: 각 발행 전 랜덤 오프셋 추가
"""

import sys
import random
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import database as db
from cafe_publisher import publish_to_cafe, post_comment
from content_generator import generate_content, content_to_plain_text
from crypto import decrypt_password
import telegram_notifier as tg

logger = logging.getLogger("scheduler")
logger.setLevel(logging.DEBUG)

_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_log_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# uvicorn dictConfig가 먼저 핸들러를 추가할 수 있으므로 항상 강제 재설정
logger.handlers.clear()
_sh = logging.StreamHandler(sys.stderr)
_sh.setFormatter(_log_fmt)
logger.addHandler(_sh)
_fh = logging.FileHandler(str(_LOG_DIR / "scheduler.log"), encoding="utf-8")
_fh.setFormatter(_log_fmt)
logger.addHandler(_fh)
logger.propagate = False


def _slog(msg: str, level: str = "INFO"):
    """로거 + stderr 직접 출력"""
    getattr(logger, level.lower(), logger.info)(msg)
    sys.stderr.write(f"[scheduler] {msg}\n")
    sys.stderr.flush()

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

def _get_eligible_accounts(config: dict, cafe_group_id: int = None, cafe_config: dict = None) -> list:
    """
    발행 가능한 계정 목록 반환
    - 카페에 지정된 계정만 (지정 없으면 전체)
    - 활성 상태인 계정
    - 최소 대기 시간(account_interval_hours) 경과한 계정
    - 카페별 일일 게시 한도(daily_post_limit) 미달 계정
    """
    accounts = db.get_accounts()
    active_accounts = [a for a in accounts if a["active"]]

    # 카페에 지정된 계정이 있으면 해당 계정만 사용
    if cafe_group_id is not None:
        assigned_ids = db.get_cafe_accounts(cafe_group_id)
        if assigned_ids:
            active_accounts = [a for a in active_accounts if a["id"] in assigned_ids]
            logger.debug(f"카페 {cafe_group_id}: 지정 계정 {len(assigned_ids)}개 중 활성 {len(active_accounts)}개")

    interval_hours = config.get("account_interval_hours", 3)
    # 카페별 설정 우선, 없으면 글로벌
    daily_post_limit = (cafe_config or config).get("daily_post_limit", 3)
    now = datetime.now()

    eligible = []
    for acc in active_accounts:
        # 카페별 일일 게시 한도 체크
        if daily_post_limit > 0:
            today_count = db.get_today_post_count(acc["id"], cafe_group_id=cafe_group_id)
            if today_count >= daily_post_limit:
                logger.debug(f"[{acc['username']}] 카페 {cafe_group_id} 일일 게시 한도 도달 ({today_count}/{daily_post_limit})")
                continue

        # 카페별 마지막 발행 시간 체크 (카페가 다르면 인터벌 독립)
        last_pub_str = db.get_account_last_published_at(acc["id"], cafe_group_id=cafe_group_id)
        if last_pub_str:
            last_pub = datetime.fromisoformat(last_pub_str)
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


def _get_next_board(keyword_id: int = None, keyword_text: str = "",
                    cafe_group_id: int = None) -> Optional[dict]:
    """
    교차 발행 로직 (카페 그룹 필터 지원):
    1. keyword_id에 명시적 게시판 매핑이 있으면 해당 게시판만 사용
    2. 매핑 없으면 keyword_text로 게시판 이름 자동 매칭
    3. 자동 매칭도 없으면 전체 활성 게시판 사용
    4. cafe_group_id 지정 시 해당 카페 게시판만 필터
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

    # 카페 그룹 필터
    if cafe_group_id is not None:
        active_boards = [b for b in active_boards if b.get("cafe_group_id") == cafe_group_id]

    if not active_boards:
        return None

    # 같은 카페가 아닌 게시판 우선 (교차 발행)
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
    exclude_author: bool = True,
    daily_comment_limit: int = 10,
    cafe_group_id: int = None
) -> list:
    """댓글 작성할 계정 선택 (카페 지정 계정 + 일일 댓글 한도 초과 계정 제외)"""
    pool = [a for a in all_accounts if a["active"]]

    # 카페에 지정된 계정이 있으면 해당 계정만 사용
    if cafe_group_id is not None:
        assigned_ids = db.get_cafe_accounts(cafe_group_id)
        if assigned_ids:
            pool = [a for a in pool if a["id"] in assigned_ids]
    if exclude_author:
        pool = [a for a in pool if a["id"] != author_id]

    # 카페별 일일 댓글 한도 초과 계정 제외
    if daily_comment_limit > 0:
        pool = [a for a in pool
                if db.get_today_comment_count(a["id"], cafe_group_id=cafe_group_id) < daily_comment_limit]

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


def _get_cafe_config(cafe: dict, global_config: dict) -> dict:
    """카페별 설정과 글로벌 설정 병합 (카페 설정 우선)"""
    merged = dict(global_config)
    # 카페별 설정으로 덮어쓰기
    cafe_keys = [
        "interval_min", "interval_max", "daily_post_limit", "daily_comment_limit",
        "comments_per_post", "comment_delay_min", "comment_delay_max",
        "comment_order", "exclude_author"
    ]
    for key in cafe_keys:
        if key in cafe and cafe[key] is not None:
            merged[key] = cafe[key]
    return merged


# ─── 단일 계정 발행 ──────────────────────────────────────────

async def _publish_single(account: dict, config: dict, cafe_group_id: int = None,
                          skip_comment: bool = False):
    """단일 계정으로 1건 발행 (키워드 선택 → 게시판 선택 → 발행 → 댓글)

    Args:
        cafe_group_id: 특정 카페 그룹으로 제한 (None이면 전체)
        skip_comment: True이면 댓글 작성 건너뜀 (1회 수동 실행용)
    """
    global _last_published_cafe

    # 1. 키워드 선택
    keyword = _get_next_keyword(config)
    if not keyword:
        logger.info("등록된 키워드 없음")
        await _notify_progress("info", {"message": "등록된 키워드가 없습니다"})
        return

    # 2. 게시판 선택 (카페 그룹 필터 적용)
    board = _get_next_board(keyword_id=keyword["id"], keyword_text=keyword["text"],
                            cafe_group_id=cafe_group_id)
    if not board:
        logger.info(f"키워드 '{keyword['text']}'에 매핑된 활성 게시판 없음 (카페 {cafe_group_id})")
        await _notify_progress("info", {"message": f"키워드 '{keyword['text']}'에 매핑된 게시판이 없습니다"})
        return

    # 2-1. 계정-카페 매핑 검증: 선택된 게시판의 카페에 계정이 등록되어 있는지 확인
    board_cafe_id = board.get("cafe_group_id")
    if board_cafe_id is not None:
        assigned_ids = db.get_cafe_accounts(board_cafe_id)
        if assigned_ids and account["id"] not in assigned_ids:
            _slog(f"[{account['username']}] 카페 {board_cafe_id}에 등록되지 않은 계정 — 발행 건너뜀", "WARNING")
            await _notify_progress("error", {
                "message": f"{account['username']}은(는) 해당 카페에 등록되지 않았습니다"
            })
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
    footer_link = config.get("footer_link", "")
    structured = generate_content(keyword["text"], cta_link=footer_link)
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
    # asyncio.to_thread는 별도 스레드에서 실행되므로
    # 메인 이벤트 루프 참조를 미리 캡처
    _main_loop = asyncio.get_running_loop()

    def on_publish_progress(step, msg):
        logger.info(f"[{account['username']}] {step}: {msg}")
        # 별도 스레드 → 메인 이벤트 루프로 SSE 전달
        try:
            _main_loop.call_soon_threadsafe(
                _main_loop.create_task,
                _notify_progress("info", {
                    "message": f"{account['username']}: {msg}",
                    "step": step,
                    "account": account["username"],
                })
            )
        except Exception:
            pass

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
        structured_content=structured,
        footer_link=config.get("footer_link", ""),
        footer_link_text=config.get("footer_link_text", "")
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

        # 텔레그램 알림
        await tg.notify_publish_success(
            account=account["username"],
            board=board["board_name"],
            keyword=keyword["text"],
            url=result["url"]
        )

        # 댓글 자동 작성 (카페별 설정 사용)
        if not skip_comment and config.get("comment_enabled"):
            await execute_comment_job(
                publish_id=publish_id,
                post_url=result["url"],
                author_id=account["id"],
                config=config,
                keyword_id=keyword["id"],
                cafe_group_id=board.get("cafe_group_id")
            )
    else:
        db.update_publish_status(publish_id, "실패", error_message=result.get("error"))
        await _notify_progress("error", {
            "message": f"발행 실패: {result.get('error')}",
            "publish_id": publish_id
        })

        # 텔레그램 알림
        await tg.notify_publish_failure(
            account=account["username"],
            board=board["board_name"],
            keyword=keyword["text"],
            error=result.get("error", "알 수 없는 오류")
        )

    logger.info(f"발행 완료: {account['username']} → {board['cafe_url']}/{board['board_name']} "
                f"결과={'성공' if result['success'] else '실패'}")


# ─── 배치 발행 작업 ──────────────────────────────────────────

async def execute_batch_job():
    """
    일일 배치 발행 작업 (스케줄러가 호출)
    - 카페별 독립 설정으로 순차 발행
    - 카페 간 교차하여 계정-카페 쌍을 인터리브
    """
    global _last_published_cafe

    if not _is_running:
        return

    global_config = db.get_schedule_config()

    # 1. 오늘 요일 체크
    today_dow = datetime.now().weekday()  # 0=월 ~ 6=일
    days = global_config.get("days", "1,1,1,1,1,0,0").split(",")
    if len(days) > today_dow and days[today_dow] == "0":
        logger.info(f"오늘은 발행하지 않는 요일 (dow={today_dow})")
        return

    # 2. 일별 지연 오프셋 대기
    offset_minutes = _calc_daily_offset_minutes(global_config)
    if offset_minutes > 0:
        base_h = global_config.get("base_start_hour", 8)
        base_m = global_config.get("base_start_minute", 0)
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

    # 3. 활성 카페 목록
    cafes = db.get_cafes()
    active_cafes = [c for c in cafes if c.get("active", 1)]

    if not active_cafes:
        logger.info("활성 카페 없음")
        await _notify_progress("info", {"message": "활성 카페가 없습니다"})
        return

    max_accounts = global_config.get("max_accounts_per_run", 30)

    # 4. 카페별 발행 작업 빌드 — (account, cafe_config, cafe_group_id) 튜플 목록
    #    계정당 카페당 daily_post_limit까지 반복 태스크 생성
    tasks = []
    for cafe in active_cafes:
        cafe_cfg = _get_cafe_config(cafe, global_config)
        daily_limit = cafe_cfg.get("daily_post_limit", 3)
        eligible = _get_eligible_accounts(global_config, cafe_group_id=cafe["id"], cafe_config=cafe_cfg)
        # 계정 순차 발행 (DB 등록 순서대로)
        cafe_task_count = 0
        for acc in eligible:
            if cafe_task_count >= max_accounts:
                break
            today_count = db.get_today_post_count(acc["id"], cafe_group_id=cafe["id"])
            remaining = max(0, daily_limit - today_count) if daily_limit > 0 else 1
            for _ in range(remaining):
                if cafe_task_count >= max_accounts:
                    break
                tasks.append((acc, cafe_cfg, cafe["id"], cafe.get("name", cafe["cafe_id"])))
                cafe_task_count += 1

    if not tasks:
        logger.info("발행 가능한 계정-카페 조합 없음")
        await _notify_progress("info", {"message": "발행 가능한 계정-카페 조합 없음"})
        return

    # 교차 발행: 카페별 작업을 인터리브 (같은 카페 연속 방지)
    if global_config.get("cross_publish", 1):
        tasks = _interleave_tasks(tasks)

    total = len(tasks)
    logger.info(f"배치 발행 시작: {total}건 ({len(active_cafes)}개 카페)")
    await _notify_progress("batch_start", {
        "message": f"배치 발행 시작: {total}건 ({len(active_cafes)}개 카페)",
        "total_accounts": total
    })

    # 5. 순차 발행
    success_count = 0
    fail_count = 0

    for i, (account, cafe_cfg, cafe_gid, cafe_name) in enumerate(tasks):
        if not _is_running:
            logger.info("스케줄러 중지됨 - 배치 중단")
            break

        turn_start = datetime.now()

        # 발행 직전 일일 한도 재확인 (배치 중 누적 반영)
        daily_limit = cafe_cfg.get("daily_post_limit", 3)
        if daily_limit > 0:
            current_count = db.get_today_post_count(account["id"], cafe_group_id=cafe_gid)
            if current_count >= daily_limit:
                logger.info(f"[{account['username']}] 카페 {cafe_name} 일일 한도 도달 ({current_count}/{daily_limit}) - 건너뜀")
                continue

        await _notify_progress("batch_progress", {
            "message": f"[{i+1}/{total}] {account['username']} → {cafe_name}",
            "current": i + 1,
            "total": total,
            "account": account["username"]
        })

        try:
            await _publish_single(account, cafe_cfg, cafe_group_id=cafe_gid)
            success_count += 1
        except Exception as e:
            fail_count += 1
            logger.error(f"[{account['username']}] 발행 중 예외: {e}")
            await _notify_progress("error", {
                "message": f"[{account['username']}] 발행 예외: {str(e)}"
            })

        # 다음 작업까지 카페별 랜덤 간격 대기
        if i < total - 1 and _is_running:
            interval_lo = cafe_cfg.get("interval_min", 3)
            interval_hi = cafe_cfg.get("interval_max", 15)
            if interval_hi < interval_lo:
                interval_hi = interval_lo
            interval = random.randint(interval_lo, interval_hi)
            elapsed = (datetime.now() - turn_start).total_seconds()
            remaining = interval * 60 - elapsed
            if remaining > 0:
                logger.info(f"다음까지 {remaining:.0f}초 대기 (랜덤 {interval}분, {i+2}/{total})")
                await _notify_progress("delay", {
                    "message": f"다음까지 {remaining:.0f}초 대기 (랜덤 {interval}분, {i+2}/{total})",
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

    # 텔레그램 배치 요약 알림
    await tg.notify_batch_complete(success_count, fail_count, total)


def _interleave_tasks(tasks: list) -> list:
    """카페별 작업을 인터리브하여 같은 카페 연속 발행 방지"""
    from collections import defaultdict
    by_cafe = defaultdict(list)
    for t in tasks:
        by_cafe[t[2]].append(t)  # t[2] = cafe_group_id

    result = []
    queues = list(by_cafe.values())
    while queues:
        for q in list(queues):
            if q:
                result.append(q.pop(0))
            else:
                queues.remove(q)
    return result


async def execute_comment_job(
    publish_id: int,
    post_url: str,
    author_id: int,
    config: dict,
    keyword_id: int = None,
    cafe_group_id: int = None
):
    """발행 후 댓글 자동 작성 (카페별 설정 사용, 키워드 매핑 템플릿 우선)"""
    comments_per_post = config.get("comments_per_post", 6)
    comment_delay_min = config.get("comment_delay_min", 60)
    comment_delay_max = config.get("comment_delay_max", 300)
    comment_order = config.get("comment_order", "random")
    exclude_author = bool(config.get("exclude_author", 1))
    daily_comment_limit = config.get("daily_comment_limit", 10)

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

    # 댓글 작성 계정 선택 (카페별 일일 댓글 한도 적용)
    comment_accounts = _select_comment_accounts(
        all_accounts, author_id, comments_per_post, comment_order, exclude_author,
        daily_comment_limit=daily_comment_limit,
        cafe_group_id=cafe_group_id
    )

    # 템플릿 중복 방지: 셔플 후 순차 사용
    shuffled_templates = list(active_templates)
    random.shuffle(shuffled_templates)

    for i, acc in enumerate(comment_accounts):
        if not _is_running:
            break

        # 중복 없이 순차 선택 (템플릿 소진 시 재셔플)
        template = shuffled_templates[i % len(shuffled_templates)]
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
    """즉시 1회 발행 (테스트/수동 실행용) - 카페-계정 매핑을 존중하여 1건 발행"""
    global _is_running
    was_running = _is_running
    _is_running = True

    try:
        _slog("=== 수동 1회 발행 시작 ===")
        config = db.get_schedule_config()

        # 활성 카페 목록에서 카페-계정 매핑을 존중하여 첫 번째 적격 조합 선택
        cafes = db.get_cafes()
        active_cafes = [c for c in cafes if c.get("active", 1)]

        account = None
        selected_cafe_id = None
        for cafe in active_cafes:
            cafe_cfg = _get_cafe_config(cafe, config)
            eligible = _get_eligible_accounts(config, cafe_group_id=cafe["id"], cafe_config=cafe_cfg)
            if eligible:
                account = eligible[0]
                selected_cafe_id = cafe["id"]
                _slog(f"선택: 계정 {account['username']} → 카페 {cafe.get('name', cafe['cafe_id'])}")
                break

        # 폴백: 매핑 없는 카페가 있을 수 있으므로 전체 활성 계정 시도
        if not account:
            accounts = db.get_accounts()
            fallback = [a for a in accounts if a["active"]]
            if fallback:
                account = fallback[0]
                _slog(f"카페 매핑 적격 없음 → 활성 계정 폴백: {account['username']}")

        if account:
            _slog(f"선택 계정: {account['username']} (id={account['id']})")
            await _notify_progress("info", {"message": f"수동 1회 발행: {account['username']}"})
            await _publish_single(account, config, cafe_group_id=selected_cafe_id, skip_comment=True)
        else:
            _slog("활성 계정 없음 — 1회 발행 불가", "WARNING")
            await _notify_progress("error", {"message": "활성 계정이 없습니다"})
    except Exception as e:
        _slog(f"수동 1회 발행 중 예외: {e}", "ERROR")
        logger.error(f"수동 1회 발행 상세:", exc_info=True)
        await _notify_progress("error", {"message": f"1회 발행 오류: {str(e)}"})
    finally:
        if not was_running:
            _is_running = False
