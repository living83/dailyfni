"""
APScheduler 기반 자동 발행 스케줄러
- 글 생성 잡: 발행 2시간 전에 글을 미리 생성하여 DB에 저장
- 발행 잡: 스케줄 시간에 사전 생성된 글을 네이버 계정별로 발행
"""

import json
import random
import asyncio
import logging
import os
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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1단계: 글 사전 생성 잡 (발행 2시간 전 실행)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def article_generation_job():
    """키워드 큐에서 다음 키워드를 가져와 3개 글을 생성하고 DB에 저장"""
    from database import (
        get_next_keyword, update_keyword, get_accounts,
        create_batch, create_publish_history, update_batch,
        create_notification, get_categories,
    )

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
    logger.info(f"글 사전 생성 시작: 키워드 = {keyword}")

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

    # 배치 생성 (status = articles_ready)
    batch = await create_batch(keyword)

    # API 키 (환경변수에서)
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        await create_notification("error", "API 키 없음", "ANTHROPIC_API_KEY가 설정되지 않았습니다.")
        return

    # 문서 3개 생성
    try:
        from prompts import DOC_TUTORIAL_PROMPT, DOC_REVIEW_PROMPT, DOC_ANALYSIS_PROMPT
        from agents import _call_claude

        doc_formats = [
            ("tutorial", DOC_TUTORIAL_PROMPT, "튜토리얼/가이드"),
            ("review", DOC_REVIEW_PROMPT, "경험담/후기"),
            ("analysis", DOC_ANALYSIS_PROMPT, "비교/분석"),
        ]

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

        for i, (fmt, prompt_template, desc) in enumerate(doc_formats):
            account = accounts_to_use[i]

            # 카테고리 가져오기
            categories = await get_categories(account["id"])
            default_cat = next((c for c in categories if c.get("is_default")), None)
            cat_id = default_cat["id"] if default_cat else None

            # 글 생성
            prompt = prompt_template.format(keyword=keyword, product_info_section=product_info_section)
            result = await asyncio.to_thread(_call_claude, api_key, prompt, 4096)

            # 제목과 본문 분리
            lines = result.strip().split("\n", 1)
            title = lines[0].strip().lstrip("# ").strip()
            body = lines[1].strip() if len(lines) > 1 else result

            # DB에 저장 (status = 'generated')
            history = await create_publish_history({
                "batch_id": batch["id"],
                "document_number": i + 1,
                "account_id": account["id"],
                "category_id": cat_id,
                "title": title,
                "content": body,
                "keywords": [keyword],
                "document_format": fmt,
            })

            # status를 generated로 업데이트
            from database import update_publish_history
            await update_publish_history(history["id"], {"status": "generated"})

            logger.info(f"글 생성 완료 [{i+1}/3]: {title[:30]}... → 계정: {account['account_name']}")

        # 배치 상태를 articles_ready로 업데이트
        await update_batch(batch["id"], {"status": "articles_ready"})

        await create_notification(
            "success",
            f"글 사전 생성 완료 ({keyword})",
            f"3개 글이 생성되어 발행 대기 중입니다. 배치 #{batch['id']}",
        )

        logger.info(f"글 사전 생성 완료: 키워드={keyword}, 배치 #{batch['id']}")

    except Exception as e:
        logger.error(f"글 사전 생성 오류: {e}")
        await update_batch(batch["id"], {"status": "all_failed"})
        await create_notification("error", "글 사전 생성 실패", str(e))


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2단계: 사전 생성된 글 발행 잡 (스케줄 시간에 실행)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def daily_publish_job():
    """사전 생성된 글(status='generated')을 네이버 계정별로 순차 발행"""
    from database import (
        get_ready_batches, get_generated_articles,
        update_publish_history, update_batch,
        update_scheduler_config, get_scheduler_config,
        create_notification, update_keyword_stats,
    )
    from crypto import decrypt
    from publisher import run_publish_task

    config = await _get_config()
    if not config.get("is_active"):
        return

    # 발행 대기 중인 배치 가져오기
    batches = await get_ready_batches()
    if not batches:
        logger.info("발행할 사전 생성 글이 없습니다.")
        return

    logger.info(f"발행 시작: {len(batches)}개 배치 대기 중")

    min_h = config.get("min_interval_hours", 2)
    max_h = config.get("max_interval_hours", 4)

    for batch in batches:
        articles = await get_generated_articles(batch["id"])
        if not articles:
            logger.warning(f"배치 #{batch['id']}: 발행할 글이 없습니다.")
            await update_batch(batch["id"], {"status": "all_failed"})
            continue

        keyword = batch["keyword"]
        logger.info(f"배치 #{batch['id']} 발행 시작: 키워드={keyword}, 글 {len(articles)}개")

        # 키워드 대표이미지
        keyword_image_path = ""
        try:
            from image_generator import generate_keyword_image
            keyword_image_path = generate_keyword_image(keyword)
        except Exception as e:
            logger.warning(f"키워드 대표이미지 생성 실패: {e}")

        success_count = 0
        failed_count = 0

        for i, article in enumerate(articles):
            account_id = article["account_id"]
            if not account_id:
                failed_count += 1
                continue

            # 계정 정보
            from database import get_account
            account = await get_account(account_id)
            if not account:
                await update_publish_history(article["id"], {
                    "status": "failed",
                    "error_message": "계정을 찾을 수 없습니다.",
                })
                failed_count += 1
                continue

            # 카테고리 이름
            cat_name = article.get("category_name", "")

            # 계정 간 발행 간격 (2~4시간)
            if i > 0:
                delay_hours = random.uniform(min_h, max_h)
                delay_seconds = delay_hours * 3600
                logger.info(f"다음 발행까지 {delay_hours:.1f}시간 대기")
                await asyncio.sleep(delay_seconds)

            # 발행 실행
            try:
                naver_id = decrypt(account["naver_id"])
                naver_pw = decrypt(account["naver_password"])

                tags = []
                try:
                    kw_data = article.get("keywords", "[]")
                    tags = json.loads(kw_data) if isinstance(kw_data, str) else kw_data
                except Exception:
                    tags = [keyword]

                # 기본 하단 링크
                footer_link = os.getenv("DEFAULT_FOOTER_LINK", "")
                footer_link_text = os.getenv("DEFAULT_FOOTER_LINK_TEXT", "")

                pub_result = await run_publish_task(
                    account_id, naver_id, naver_pw,
                    article["title"], article["content"],
                    cat_name, tags, keyword_image_path,
                    footer_link, footer_link_text,
                )

                if pub_result["success"]:
                    await update_publish_history(article["id"], {
                        "status": "success",
                        "naver_post_url": pub_result["url"],
                        "published_at": datetime.now().isoformat(),
                    })
                    await update_keyword_stats(keyword, account_id)
                    success_count += 1
                    logger.info(f"발행 성공 [{i+1}/{len(articles)}]: {article['title'][:30]}...")
                else:
                    await update_publish_history(article["id"], {
                        "status": "failed",
                        "error_message": pub_result["error"],
                    })
                    failed_count += 1
                    logger.warning(f"발행 실패 [{i+1}/{len(articles)}]: {pub_result['error']}")

            except Exception as e:
                await update_publish_history(article["id"], {
                    "status": "failed",
                    "error_message": str(e),
                })
                failed_count += 1
                logger.error(f"발행 오류: {e}")

        # 배치 결과 업데이트
        status = "all_success" if failed_count == 0 else ("all_failed" if success_count == 0 else "partial_success")
        await update_batch(batch["id"], {
            "status": status,
            "success_count": success_count,
            "failed_count": failed_count,
        })

        # 완료 알림
        await create_notification(
            "success" if status == "all_success" else "warning",
            f"자동 발행 완료 ({keyword})",
            f"성공: {success_count}개, 실패: {failed_count}개",
        )

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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 스케줄러 제어
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def start_scheduler():
    """스케줄러 시작 (글 생성 + 발행 두 개의 잡 등록)"""
    global _is_running
    if _is_running:
        return

    config = await _get_config()
    start_h = config.get("start_hour", 16)
    start_m = config.get("start_minute", 0)

    # 글 생성 시간: 발행 시작 2시간 전
    gen_h = (start_h - 2) % 24
    gen_m = start_m

    # 1) 글 사전 생성 잡 (발행 2시간 전)
    scheduler.add_job(
        article_generation_job,
        "cron",
        hour=gen_h,
        minute=gen_m,
        id="article_generation",
        replace_existing=True,
    )

    # 2) 발행 잡 (설정된 시간)
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
    logger.info(f"스케줄러 시작: 글 생성 {gen_h:02d}:{gen_m:02d}, 발행 {start_h:02d}:{start_m:02d}")


async def stop_scheduler():
    """스케줄러 중지"""
    global _is_running
    try:
        scheduler.remove_job("article_generation")
    except Exception:
        pass
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
                "name": "글 사전 생성" if job.id == "article_generation" else "네이버 발행",
                "next_run_time": str(job.next_run_time) if job.next_run_time else None,
            }
            for job in jobs
        ],
    }
