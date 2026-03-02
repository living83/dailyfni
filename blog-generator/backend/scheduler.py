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

async def article_generation_job(manual: bool = False):
    """키워드 큐에서 다음 키워드를 가져와 3개 글을 생성하고 DB에 저장
    manual=True이면 스케줄러 활성 여부/오늘 건너뛰기 체크를 무시한다."""
    try:
        print(f"[scheduler] article_generation_job 시작 (manual={manual})", flush=True)
        logger.info(f"article_generation_job 시작 (manual={manual})")
        from database import (
            get_next_keyword, update_keyword, get_accounts,
            create_batch, create_publish_history, update_batch,
            create_notification, get_categories,
        )

        if not manual:
            config = await _get_config()
            if not config.get("is_active"):
                logger.info("스케줄러 비활성 → 생성 건너뜀")
                return

            # 오늘 건너뛸지 확인
            if await _should_skip_today(config):
                await create_notification("info", "오늘 자동 발행 건너뜀", "스케줄 설정에 의해 오늘은 발행을 건너뜁니다.")
                return

        # 다음 키워드 가져오기
        kw = await get_next_keyword()
        if not kw:
            logger.warning("발행할 키워드가 없습니다")
            await create_notification("warning", "키워드 부족", "발행할 키워드가 없습니다. 키워드를 추가해주세요.")
            return

        keyword = kw["keyword"]
        product_info = kw.get("product_info", "")
        logger.info(f"글 사전 생성 시작: 키워드 = {keyword}, 타입 = {kw.get('priority', 'ad')}")

        # 활성 계정 가져오기
        accounts = await get_accounts()
        active_accounts = [a for a in accounts if a.get("is_active")]
        logger.info(f"활성 계정 수: {len(active_accounts)}")
        if len(active_accounts) == 0:
            await create_notification("error", "계정 없음", "활성 계정이 없습니다. 계정을 추가해주세요.")
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

        # 글 타입 결정 (일반/광고)
        post_type = kw.get("priority", "ad")  # priority 컬럼에 "ad" 또는 "general" 저장

        # 문서 생성
        try:
            from prompts import DOC_TUTORIAL_PROMPT, DOC_REVIEW_PROMPT, DOC_ANALYSIS_PROMPT
            from prompts import AD_FOOTER, GENERAL_FOOTER
            from agents import _call_claude

            ad_footer = AD_FOOTER if post_type == "ad" else GENERAL_FOOTER

            all_doc_formats = [
                ("tutorial", DOC_TUTORIAL_PROMPT, "튜토리얼/가이드"),
                ("review", DOC_REVIEW_PROMPT, "경험담/후기"),
                ("analysis", DOC_ANALYSIS_PROMPT, "비교/분석"),
            ]
            # 활성 계정 수만큼만 생성
            doc_formats = all_doc_formats[:len(accounts_to_use)]

            product_info_section = ""
            if product_info.strip():
                product_info_section = f"\n상품소개:\n{product_info.strip()}\n"

            # 키워드 대표이미지 3개 생성 (색상 변형, 저품질 방지)
            keyword_image_paths = []
            try:
                from image_generator import generate_keyword_image_variants
                keyword_image_paths = generate_keyword_image_variants(keyword, count=3)
                logger.info(f"키워드 대표이미지 {len(keyword_image_paths)}개 생성 완료")
            except Exception as e:
                logger.warning(f"키워드 대표이미지 생성 실패: {e}")

            for i, (fmt, prompt_template, desc) in enumerate(doc_formats):
                account = accounts_to_use[i]

                # 카테고리 가져오기
                categories = await get_categories(account["id"])
                default_cat = next((c for c in categories if c.get("is_default")), None)
                cat_id = default_cat["id"] if default_cat else None

                # 글 생성
                prompt = prompt_template.format(
                    keyword=keyword,
                    product_info_section=product_info_section,
                    ad_footer=ad_footer,
                )
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

                logger.info(f"글 생성 완료 [{i+1}/{len(doc_formats)}]: {title[:30]}... → 계정: {account['account_name']}")

            # 배치 상태를 articles_ready로 업데이트
            await update_batch(batch["id"], {"status": "articles_ready"})

            await create_notification(
                "success",
                f"글 사전 생성 완료 ({keyword})",
                f"{len(doc_formats)}개 글이 생성되어 발행 대기 중입니다. 배치 #{batch['id']}",
            )

            logger.info(f"글 사전 생성 완료: 키워드={keyword}, 배치 #{batch['id']}")

        except Exception as e:
            logger.error(f"글 사전 생성 오류: {e}")
            await update_batch(batch["id"], {"status": "all_failed"})
            await create_notification("error", "글 사전 생성 실패", str(e))

    except Exception as e:
        logger.error(f"article_generation_job 예외: {e}", exc_info=True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2단계: 사전 생성된 글 발행 잡 (스케줄 시간에 실행)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def daily_publish_job(manual: bool = False):
    """사전 생성된 글(status='generated')을 네이버 계정별로 순차 발행
    manual=True이면 스케줄러 활성 여부 체크를 무시한다."""
    from database import (
        get_ready_batches, get_generated_articles,
        update_publish_history, update_batch,
        update_scheduler_config, get_scheduler_config,
        create_notification, update_keyword_stats,
    )
    from crypto import decrypt
    from publisher import run_publish_task

    config = await _get_config()
    if not manual:
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

        # 키워드 대표이미지 3개 생성 (색상 변형, 저품질 방지)
        keyword_image_paths = []
        try:
            from image_generator import generate_keyword_image_variants
            keyword_image_paths = generate_keyword_image_variants(keyword, count=3)
            logger.info(f"키워드 대표이미지 {len(keyword_image_paths)}개 생성 완료")
        except Exception as e:
            logger.warning(f"키워드 대표이미지 생성 실패: {e}")

        # 계정 자동 분배: 모든 글이 같은 account_id면 활성 계정들에 순차 분배
        from database import get_accounts, get_account, get_categories
        account_ids = [a["account_id"] for a in articles if a.get("account_id")]
        unique_accounts = set(account_ids)
        if len(unique_accounts) <= 1 and len(articles) > 1:
            all_accounts = await get_accounts()
            active_accounts = [a for a in all_accounts if a.get("is_active")]
            if len(active_accounts) > 1:
                logger.info(f"계정 자동 분배: {len(articles)}개 글 → {len(active_accounts)}개 활성 계정")
                for idx, article in enumerate(articles):
                    assigned = active_accounts[idx % len(active_accounts)]
                    article["account_id"] = assigned["id"]
                    # 카테고리도 해당 계정의 기본 카테고리로 재설정
                    try:
                        cats = await get_categories(assigned["id"])
                        default_cat = next((c for c in cats if c.get("is_default")), None)
                        if default_cat:
                            article["category_name"] = default_cat.get("category_name", "")
                    except Exception:
                        pass
                    logger.info(f"  글 {idx+1} → 계정: {assigned.get('account_name', assigned['id'])}")

        # 계정 교차 발행: 같은 계정 연속 방지 (저품질 방지)
        if len(articles) > 1:
            from collections import defaultdict
            groups = defaultdict(list)
            for article in articles:
                groups[article.get("account_id")].append(article)
            if len(groups) > 1:
                reordered = []
                while any(groups.values()):
                    for aid in sorted(groups.keys()):
                        if groups[aid]:
                            reordered.append(groups[aid].pop(0))
                articles = reordered
                logger.info(f"계정 교차 정렬: {' → '.join(str(a.get('account_id')) for a in articles)}")

        success_count = 0
        failed_count = 0

        for i, article in enumerate(articles):
            account_id = article["account_id"]
            if not account_id:
                failed_count += 1
                continue

            # 계정 정보
            account = await get_account(account_id)
            logger.info(f"글 {i+1}/{len(articles)} 발행 시작: 계정={account.get('account_name', '?') if account else '미발견'}")
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

                # 기본 하단 링크 (DB 설정 → 환경변수 순)
                footer_link = config.get("footer_link", "") or os.getenv("DEFAULT_FOOTER_LINK", "")
                footer_link_text = config.get("footer_link_text", "") or os.getenv("DEFAULT_FOOTER_LINK_TEXT", "")
                logger.info(f"하단 링크: footer_link={footer_link!r}, footer_link_text={footer_link_text!r}")

                pub_result = await run_publish_task(
                    account_id, naver_id, naver_pw,
                    article["title"], article["content"],
                    cat_name, tags,
                    keyword_image_paths[i % len(keyword_image_paths)] if keyword_image_paths else "",
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
# 참여(공감/댓글) 잡
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def daily_engagement_job():
    """하루 1회 블로그 참여(공감 + AI 댓글) 자동 실행"""
    from database import get_scheduler_config, get_accounts, get_account, create_engagement, create_notification
    from crypto import decrypt
    from blog_engagement import run_engagement

    config = await get_scheduler_config()
    if not config.get("engagement_enabled"):
        return

    max_posts = config.get("engagement_max_posts", 10)
    do_like = bool(config.get("engagement_do_like", 1))
    do_comment = bool(config.get("engagement_do_comment", 1))
    api_key = os.getenv("ANTHROPIC_API_KEY", "")

    all_accounts = await get_accounts()
    active_accounts = [a for a in all_accounts if a.get("is_active")]

    selected_ids = config.get("engagement_account_ids", [])
    if selected_ids:
        account_map = {a["id"]: a for a in active_accounts}
        active_accounts = [account_map[aid] for aid in selected_ids if aid in account_map]

    if not active_accounts:
        logger.warning("참여 실행: 활성 계정 없음")
        return

    logger.info(f"참여 잡 시작: {len(active_accounts)}개 계정, 포스팅 최대 {max_posts}개")

    total_likes = 0
    total_comments = 0

    for i, account in enumerate(active_accounts):
        account_id = account["id"]
        logger.info(f"참여 [{i+1}/{len(active_accounts)}]: 계정 {account.get('account_name', account_id)}")

        try:
            naver_id = decrypt(account["naver_id"])
            naver_pw = decrypt(account["naver_password"])

            result = await run_engagement(
                account_id, naver_id, naver_pw,
                api_key, max_posts, do_like, do_comment,
            )

            for eng in result.get("results", []):
                await create_engagement({
                    "account_id": account_id,
                    "post_url": eng.get("post_url", ""),
                    "post_title": eng.get("post_title", ""),
                    "like_success": eng.get("like_success", False),
                    "comment_success": eng.get("comment_success", False),
                    "comment_text": eng.get("comment_text", ""),
                    "error_message": eng.get("error", ""),
                })

            total_likes += result.get("like_count", 0)
            total_comments += result.get("comment_count", 0)

        except Exception as e:
            logger.error(f"참여 오류 (계정 {account_id}): {e}")

        # 계정 간 대기 (30초~1분)
        if i < len(active_accounts) - 1:
            delay = random.uniform(30, 60)
            logger.info(f"다음 계정까지 {delay:.0f}초 대기")
            await asyncio.sleep(delay)

    logger.info(f"참여 잡 완료: 공감 {total_likes}, 댓글 {total_comments}")

    try:
        await create_notification({
            "type": "success",
            "title": "참여 완료",
            "message": f"공감 {total_likes}개, 댓글 {total_comments}개 완료",
        })
    except Exception:
        pass


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

    # 3) 참여(공감/댓글) 잡
    eng_enabled = config.get("engagement_enabled", 0)
    eng_h = config.get("engagement_hour", 14)
    eng_m = config.get("engagement_minute", 0)
    if eng_enabled:
        scheduler.add_job(
            daily_engagement_job,
            "cron",
            hour=eng_h,
            minute=eng_m,
            id="daily_engagement",
            replace_existing=True,
        )

    if not scheduler.running:
        scheduler.start()
    _is_running = True
    eng_str = f", 참여 {eng_h:02d}:{eng_m:02d}" if eng_enabled else ""
    logger.info(f"스케줄러 시작: 글 생성 {gen_h:02d}:{gen_m:02d}, 발행 {start_h:02d}:{start_m:02d}{eng_str}")


async def stop_scheduler():
    """스케줄러 중지"""
    global _is_running
    for job_id in ("article_generation", "daily_publish", "daily_engagement"):
        try:
            scheduler.remove_job(job_id)
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
