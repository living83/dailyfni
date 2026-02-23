"""
APScheduler 기반 자동 발행 스케줄러
- 매일 지정된 시간대에 자동 발행
- 랜덤 시간, 휴식일, 주말 확률 조절
"""

import json
import random
import asyncio
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger("scheduler")

scheduler = AsyncIOScheduler()
_is_running = False


async def _get_config():
    from database import get_scheduler_config
    return await get_scheduler_config()


async def _should_skip_today(config: dict) -> bool:
    """오늘 발행을 건너뛸지 결정"""
    now = datetime.now()
    weekday = now.isoweekday()  # 1=월 ~ 7=일

    # 요일 체크
    allowed_days = config.get("days_of_week", [1, 2, 3, 4, 5])
    if weekday not in allowed_days:
        logger.info(f"오늘({weekday})은 발행 요일이 아닙니다.")
        return True

    # 주말 발행 확률
    if weekday in (6, 7) and config.get("weekend_low_prob"):
        prob = config.get("weekend_prob_percent", 30) / 100
        if random.random() > prob:
            logger.info(f"주말 발행 확률({prob*100}%)에 의해 건너뜁니다.")
            return True

    # 연속 발행일 체크
    consecutive = config.get("consecutive_publish_days", 0)
    force_rest = config.get("force_rest_after_days", 3)
    if force_rest > 0 and consecutive >= force_rest:
        logger.info(f"연속 {consecutive}일 발행 후 강제 휴식")
        return True

    # 랜덤 휴식
    if config.get("random_rest_enabled"):
        rest_prob = config.get("random_rest_percent", 20) / 100
        if random.random() < rest_prob:
            logger.info(f"랜덤 휴식({rest_prob*100}%)에 의해 건너뜁니다.")
            return True

    return False


def _random_time_in_range(start_h: int, start_m: int, end_h: int, end_m: int) -> datetime:
    """지정된 시간 범위 내 랜덤 시간 생성"""
    now = datetime.now()
    start = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    end = now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
    delta = (end - start).total_seconds()
    random_seconds = random.randint(0, max(int(delta), 0))
    return start + timedelta(seconds=random_seconds)


async def daily_publish_job():
    """매일 실행되는 자동 발행 작업"""
    from database import (
        get_next_keyword, update_keyword, get_accounts,
        create_batch, create_publish_history, update_publish_history,
        update_batch, update_scheduler_config, get_scheduler_config,
        create_notification, update_keyword_stats, get_categories,
    )
    from crypto import decrypt
    from publisher import run_publish_task
    from agents import run_research_agent, run_seo_agent, run_writer_agent, run_reviewer_agent

    config = await _get_config()
    if not config.get("is_active"):
        return

    # 오늘 건너뛸지 확인
    if await _should_skip_today(config):
        await create_notification("info", "오늘 자동 발행 건너뜀", "스케줄 설정에 의해 오늘은 발행을 건너뜁니다.")
        return

    # 다음 키워드 가져오기
    kw = await get_next_keyword()
    if not kw:
        await create_notification("warning", "키워드 부족", "발행할 키워드가 없습니다. 키워드를 추가해주세요.")
        return

    keyword = kw["keyword"]
    product_info = kw.get("product_info", "")
    logger.info(f"자동 발행 시작: 키워드 = {keyword}")

    # 활성 계정 가져오기
    accounts = await get_accounts()
    active_accounts = [a for a in accounts if a.get("is_active")]
    if len(active_accounts) < 3:
        await create_notification("error", "계정 부족", f"활성 계정이 {len(active_accounts)}개입니다. 최소 3개 필요합니다.")
        return

    accounts_to_use = active_accounts[:3]

    # 키워드 상태 업데이트
    now = datetime.now()
    await update_keyword(kw["id"], {
        "status": "used",
        "last_used_at": now.isoformat(),
        "next_available_at": (now + timedelta(days=30)).isoformat(),
        "used_count": kw["used_count"] + 1,
    })

    # 배치 생성
    batch = await create_batch(keyword)

    # API 키 (환경변수에서)
    import os
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        await create_notification("error", "API 키 없음", "ANTHROPIC_API_KEY가 설정되지 않았습니다.")
        return

    # 문서 3개 생성
    try:
        from prompts import DOC_TUTORIAL_PROMPT, DOC_REVIEW_PROMPT, DOC_ANALYSIS_PROMPT

        doc_formats = [
            ("tutorial", DOC_TUTORIAL_PROMPT, "튜토리얼/가이드"),
            ("review", DOC_REVIEW_PROMPT, "경험담/후기"),
            ("analysis", DOC_ANALYSIS_PROMPT, "비교/분석"),
        ]

        # 상품소개가 있으면 프롬프트에 삽입
        product_info_section = ""
        if product_info.strip():
            product_info_section = f"\n상품소개:\n{product_info.strip()}\n"

        # 키워드 대표이미지 생성
        keyword_image_path = ""
        try:
            from image_generator import generate_keyword_image
            keyword_image_path = generate_keyword_image(keyword)
            logger.info(f"키워드 대표이미지 생성: {keyword_image_path}")
        except Exception as e:
            logger.warning(f"키워드 대표이미지 생성 실패: {e}")

        documents = []
        for fmt, prompt_template, desc in doc_formats:
            prompt = prompt_template.format(keyword=keyword, product_info_section=product_info_section)
            from agents import _call_claude
            result = _call_claude(api_key, prompt, max_tokens=4096)
            # 제목과 본문 분리
            lines = result.strip().split("\n", 1)
            title = lines[0].strip().lstrip("# ").strip()
            body = lines[1].strip() if len(lines) > 1 else result
            documents.append({
                "title": title,
                "content": body,
                "format": fmt,
                "keywords": [keyword],
            })

        # 발행 간격 계산
        min_h = config.get("min_interval_hours", 2)
        max_h = config.get("max_interval_hours", 4)

        for i, (doc, account) in enumerate(zip(documents, accounts_to_use)):
            # 카테고리 가져오기
            categories = await get_categories(account["id"])
            default_cat = next((c for c in categories if c.get("is_default")), None)
            cat_name = default_cat["category_name"] if default_cat else ""
            cat_id = default_cat["id"] if default_cat else None

            # 발행 이력 생성
            history = await create_publish_history({
                "batch_id": batch["id"],
                "document_number": i + 1,
                "account_id": account["id"],
                "category_id": cat_id,
                "title": doc["title"],
                "content": doc["content"],
                "keywords": doc["keywords"],
                "document_format": doc["format"],
            })

            if i > 0:
                # 계정 간 발행 간격 (2~4시간)
                delay_hours = random.uniform(min_h, max_h)
                delay_seconds = delay_hours * 3600
                logger.info(f"다음 발행까지 {delay_hours:.1f}시간 대기")
                await asyncio.sleep(delay_seconds)

            # 발행 실행
            try:
                naver_id = decrypt(account["naver_id"])
                naver_pw = decrypt(account["naver_password"])

                pub_result = await run_publish_task(
                    account["id"], naver_id, naver_pw,
                    doc["title"], doc["content"], cat_name, doc["keywords"],
                    keyword_image_path,
                )

                if pub_result["success"]:
                    await update_publish_history(history["id"], {
                        "status": "success",
                        "naver_post_url": pub_result["url"],
                        "published_at": datetime.now().isoformat(),
                    })
                    await update_keyword_stats(keyword, account["id"])
                else:
                    await update_publish_history(history["id"], {
                        "status": "failed",
                        "error_message": pub_result["error"],
                    })
            except Exception as e:
                await update_publish_history(history["id"], {
                    "status": "failed",
                    "error_message": str(e),
                })
                logger.error(f"발행 실패: {e}")

        # 배치 결과 업데이트
        histories = []
        from database import get_batch_history
        histories = await get_batch_history(batch["id"])
        success_count = sum(1 for h in histories if h["status"] == "success")
        failed_count = sum(1 for h in histories if h["status"] == "failed")

        status = "all_success" if failed_count == 0 else ("all_failed" if success_count == 0 else "partial_success")
        await update_batch(batch["id"], {
            "status": status,
            "success_count": success_count,
            "failed_count": failed_count,
        })

        # 연속 발행일 업데이트
        today = datetime.now().strftime("%Y-%m-%d")
        last_date = config.get("last_publish_date", "")
        if last_date == (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d"):
            consecutive = config.get("consecutive_publish_days", 0) + 1
        else:
            consecutive = 1
        await update_scheduler_config({
            "consecutive_publish_days": consecutive,
            "last_publish_date": today,
        })

        # 완료 알림
        await create_notification(
            "success" if status == "all_success" else "warning",
            f"자동 발행 완료 ({keyword})",
            f"성공: {success_count}개, 실패: {failed_count}개",
        )

    except Exception as e:
        logger.error(f"자동 발행 전체 오류: {e}")
        await update_batch(batch["id"], {"status": "all_failed"})
        await create_notification("error", "자동 발행 실패", str(e))


async def start_scheduler():
    """스케줄러 시작"""
    global _is_running
    if _is_running:
        return

    config = await _get_config()
    start_h = config.get("start_hour", 8)
    start_m = config.get("start_minute", 0)

    # 매일 지정된 시작 시간에 실행
    scheduler.add_job(
        daily_publish_job,
        "cron",
        hour=start_h,
        minute=start_m,
        id="daily_publish",
        replace_existing=True,
    )

    if not scheduler.running:
        scheduler.start()
    _is_running = True
    logger.info(f"스케줄러 시작: 매일 {start_h:02d}:{start_m:02d}")


async def stop_scheduler():
    """스케줄러 중지"""
    global _is_running
    try:
        scheduler.remove_job("daily_publish")
    except Exception:
        pass
    _is_running = False
    logger.info("스케줄러 중지")


def get_scheduler_status() -> dict:
    """스케줄러 상태 조회"""
    jobs = scheduler.get_jobs()
    return {
        "is_running": _is_running,
        "jobs": [
            {
                "id": job.id,
                "next_run_time": str(job.next_run_time) if job.next_run_time else None,
            }
            for job in jobs
        ],
    }
