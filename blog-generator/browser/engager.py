"""
engager.py — 네이버 블로그 좋아요/댓글 참여 엔진
naver-auto blog_engagement.py v2026-03-06-v10 기반 이식
핵심: mainFrame iframe 접근 + cbox5 REST API 직접 호출
"""

import asyncio
import random
import re
import os
from typing import Optional

from loguru import logger
from playwright.async_api import Page, async_playwright

from browser.se_helpers import (
    _get_proxy_for_account,
    capture_debug,
    create_stealth_context,
    login,
    random_delay,
    try_selectors,
)
from config import settings

CODE_VERSION = "2026-04-06-v10-dailyfni"


# ──────────────────────────────────────────────────────────────
# 공개 진입점
# ──────────────────────────────────────────────────────────────

async def engage_neighbor(account: dict, blog_url: str, actions: dict, progress_callback=None) -> dict:
    """
    단일 블로그 포스트에 대한 공감/댓글 실행 (기존 API 호환)
    """
    result = {
        "success": False,
        "liked": False,
        "error": None,
    }

    proxy = await _get_proxy_for_account(account.get("id", 0))
    headless = getattr(settings, "HEADLESS", True)

    async with async_playwright() as p:
        browser, context = await create_stealth_context(p, proxy=proxy, headless=headless)
        try:
            ok = await login(
                context,
                naver_id=account["naver_id"],
                naver_password=account["naver_password"],
                account_id=account.get("id", 0),
            )
            if not ok:
                result["error"] = "로그인 실패"
                return result

            page = await context.new_page()
            await page.goto(blog_url, wait_until="load", timeout=20000)
            await random_delay(2, 4)

            if not await is_actual_post_page(page):
                result["error"] = "유효한 포스트 페이지가 아닙니다"
                return result

            # 공감만 실행 (댓글 기능 제거됨)
            if actions.get("like"):
                like_res = await click_like(page)
                result["liked"] = like_res["success"]
                if like_res.get("error"):
                    result["error"] = like_res["error"]

            result["success"] = result["liked"]

        except Exception as e:
            logger.exception(f"engage_neighbor 예외: {e}")
            result["error"] = str(e)
        finally:
            try:
                await browser.close()
            except Exception:
                pass

    return result


# ──────────────────────────────────────────────────────────────
# 배치 실행 (대시보드 이웃참여 봇에서 호출)
# ──────────────────────────────────────────────────────────────

async def run_engagement(account: dict, config: dict) -> dict:
    """
    단일 계정의 참여 활동(좋아요+댓글)을 배치 실행
    config: { engagement_max_posts, engagement_do_like }
    """
    account_id = account.get("id", 0)
    proxy = await _get_proxy_for_account(account_id)
    result_base = {
        "account_id": account_id,
        "total_posts": 0,
        "like_count": 0,
        "results": [],
        "error": None,
    }

    headless = getattr(settings, "HEADLESS", True)
    async with async_playwright() as p:
        browser, context = await create_stealth_context(p, proxy=proxy, headless=headless)
        try:
            ok = await login(
                context,
                naver_id=account["naver_id"],
                naver_password=account["naver_password"],
                account_id=account_id,
            )
            if not ok:
                result_base["error"] = "로그인 실패"
                return result_base

            # 포스트 수집용 페이지 (끝나면 닫음)
            collect_page = await context.new_page()
            max_posts = config.get("engagement_max_posts", 10)
            post_items = await collect_blog_posts(collect_page, max_posts=max_posts)
            await collect_page.close()

            result_base["total_posts"] = len(post_items)

            if not post_items:
                result_base["error"] = "참여할 포스팅을 수집하지 못했습니다."
                return result_base

            logger.info(f"[계정 {account_id}] {len(post_items)}개 포스팅 병렬 처리 시작 (최대 3개 동시)")

            do_like = config.get("engagement_do_like", True)

            # 병렬 처리 — 동시 실행 수 제한 (3개)
            CONCURRENCY = 3
            semaphore = asyncio.Semaphore(CONCURRENCY)

            async def process_one(idx, item):
                async with semaphore:
                    post_url = item.get("url") if isinstance(item, dict) else str(item)
                    post_title = item.get("title", "") if isinstance(item, dict) else ""
                    logger.info(f"[{idx+1}/{len(post_items)}] 시작: {post_title[:30]}")

                    # 각 포스트마다 독립된 페이지 (같은 context 공유 → 쿠키 유지)
                    page = await context.new_page()
                    try:
                        # 동시 시작 시 네이버가 감지할 수 있으므로 작은 지연
                        await asyncio.sleep(random.uniform(0.5, 2.0))
                        return await engage_single_post(
                            page=page,
                            post_url=post_url,
                            do_like=do_like,
                        )
                    finally:
                        try:
                            await page.close()
                        except Exception:
                            pass

            # 모든 포스트 병렬 실행
            tasks = [process_one(i, item) for i, item in enumerate(post_items)]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 결과 집계
            for r in results:
                if isinstance(r, Exception):
                    logger.error(f"포스트 처리 예외: {r}")
                    continue
                result_base["results"].append(r)
                if r.get("like_success"):
                    result_base["like_count"] += 1

            logger.info(f"[계정 {account_id}] 완료 — 공감 {result_base['like_count']}건")

        except Exception as e:
            logger.exception(f"[계정 {account_id}] 배치 참여 예외: {e}")
            result_base["error"] = str(e)
        finally:
            try:
                await browser.close()
            except Exception:
                pass

    return result_base


async def engage_single_post(page: Page, post_url: str, do_like: bool, do_comment: bool = False, api_key: str = '') -> dict:
    """단일 포스팅에 대해 공감 (댓글 기능 제거)"""
    res = {
        "post_url": post_url,
        "post_title": "",
        "like_success": False,
        "error": None,
    }

    try:
        await page.goto(post_url, wait_until="load", timeout=20000)
        await random_delay(2, 4)

        if not await is_actual_post_page(page):
            res["error"] = "유효한 포스트 페이지가 아닙니다 (스킵)"
            return res

        # 제목 추출 (기록용)
        main_frame = next((f for f in page.frames if f.name == 'mainFrame'), page)
        try:
            title = await main_frame.evaluate('''() => {
                const el = document.querySelector('.se-title-text, .pcol1, h3.se_textarea');
                return el ? el.innerText.trim() : '';
            }''')
            res["post_title"] = title
        except Exception:
            pass

        # 공감만 실행
        if do_like:
            like_res = await click_like(page)
            res["like_success"] = like_res["success"]
            if like_res.get("error"):
                res["error"] = like_res["error"]

    except Exception as e:
        logger.error(f"포스팅 참여 중 오류 ({post_url}): {e}")
        res["error"] = str(e)

    return res


# ──────────────────────────────────────────────────────────────
# 세부 기능
# ──────────────────────────────────────────────────────────────

async def is_actual_post_page(page: Page) -> bool:
    """현재 페이지가 실제 블로그 포스트 페이지인지 검증"""
    current_url = page.url or ""

    home_patterns = [
        "/BlogHome", "/PostList.naver", "/my-log", "/market",
        "/neighborlog", "/SympathyHistoryList", "/PostChat.naver",
        "/ProfileView.naver", "/profile/", "/GuestbookList.naver",
    ]
    for pat in home_patterns:
        if pat in current_url:
            return False

    if re.search(r'blog\.naver\.com/[^/\?]+/\d{6,}', current_url):
        return True

    main_frame = next((f for f in page.frames if f.name == 'mainFrame'), page)
    try:
        is_post = await main_frame.evaluate('''() => {
            const sels = ['.se-main-container', '#postViewArea', '#post-view', '.post_ct'];
            return sels.some(s => {
                const el = document.querySelector(s);
                return el && el.innerText.trim().length > 30;
            });
        }''')
        return is_post
    except Exception:
        return False


async def collect_blog_posts(page: Page, max_posts: int = 10) -> list:
    """주제별 보기(ThemePost)에서 최신 포스팅 수집"""
    posts = []
    themes = ["1", "5", "6", "13", "12", "15", "23", "32"]
    theme_id = random.choice(themes)
    url = f"https://section.blog.naver.com/ThemePost.naver?directoryNo={theme_id}&activeDirectorySeq=0"

    try:
        await page.goto(url, wait_until="load", timeout=20000)
        await random_delay(2, 3)

        try:
            latest_btn = await page.query_selector('label[for="order_latest"]')
            if latest_btn:
                await latest_btn.click()
                await random_delay(1, 2)
        except Exception:
            pass

        for _ in range(3):
            elements = await page.query_selector_all('a.desc_inner, a.info_post, a[class*="title"]')
            for el in elements:
                href = await el.get_attribute("href")
                title = await el.inner_text()
                if href and "blog.naver.com" in href and ("/PostView" in href or re.search(r'/\d{6,}', href)):
                    if not any(p["url"] == href for p in posts):
                        posts.append({"url": href, "title": title.strip()})
                if len(posts) >= max_posts:
                    break
            if len(posts) >= max_posts:
                break
            await page.mouse.wheel(0, 1500)
            await random_delay(1, 1.5)
    except Exception as e:
        logger.error(f"포스팅 수집 오류: {e}")

    return posts[:max_posts]


async def click_like(page: Page) -> dict:
    """공감(좋아요) 클릭 — JS 기반 완전 우회 방식 (v11)"""
    result = {"success": False, "error": ""}
    try:
        main_frame = next((f for f in page.frames if f.name == 'mainFrame'), page)

        # 초기 상태 저장 → 클릭 후 비교
        initial_state = await main_frame.evaluate('''() => {
            const sels = [
                '.area_sympathy .u_likeit_btn',
                '.u_likeit_btn',
                'a[role="button"][class*="like"]',
                'button[class*="like"]',
            ];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) {
                    return {
                        found: true,
                        isOn: el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true',
                        count: el.querySelector('.u_cnt, [class*="count"], em')?.innerText || '0',
                        html: el.outerHTML.substring(0, 200),
                    };
                }
            }
            return { found: false };
        }''')

        if not initial_state.get('found'):
            # 아래로 스크롤해서 지연 로드된 버튼 찾기
            await main_frame.evaluate('window.scrollTo(0, document.body.scrollHeight * 0.8)')
            await random_delay(1.5, 2.5)
            initial_state = await main_frame.evaluate('''() => {
                const sels = ['.area_sympathy .u_likeit_btn', '.u_likeit_btn', 'a[role="button"][class*="like"]', 'button[class*="like"]'];
                for (const sel of sels) {
                    const el = document.querySelector(sel);
                    if (el) return { found: true, isOn: el.classList.contains('on'), count: '0' };
                }
                return { found: false };
            }''')

        if not initial_state.get('found'):
            return {"success": False, "error": "좋아요 버튼 미발견"}

        if initial_state.get('isOn'):
            logger.info("이미 공감된 포스팅")
            return {"success": True, "already": True}

        # 완전 JS 기반 클릭 — Playwright가 건드리지 않도록
        click_result = await main_frame.evaluate('''async () => {
            const sels = [
                '.area_sympathy .u_likeit_btn',
                '.u_likeit_btn',
                'a[role="button"][class*="like"]',
                'button[class*="like"]',
            ];
            let el = null;
            for (const sel of sels) {
                el = document.querySelector(sel);
                if (el) break;
            }
            if (!el) return { success: false, error: 'no element' };

            // 1) 강제 스크롤 — 중앙으로
            el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            await new Promise(r => setTimeout(r, 300));

            // 2) 실제 클릭 타겟 찾기 — a/button 안의 첫 번째 인터랙티브 요소
            const target = el.querySelector('button, a, span[role="button"]') || el;

            // 3) 다중 이벤트 디스패치 (mousedown + mouseup + click)
            const rect = target.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };

            target.dispatchEvent(new MouseEvent('mousedown', opts));
            await new Promise(r => setTimeout(r, 50));
            target.dispatchEvent(new MouseEvent('mouseup', opts));
            await new Promise(r => setTimeout(r, 50));
            target.dispatchEvent(new MouseEvent('click', opts));

            // 4) fallback: 직접 .click() 호출
            try { target.click(); } catch (e) {}

            await new Promise(r => setTimeout(r, 1500));

            return { success: true, clicked: target.outerHTML.substring(0, 150) };
        }''')

        logger.debug(f"클릭 결과: {click_result}")
        await random_delay(1, 2)

        # 리액션 피커가 나타나면 처리 (네이버 2025.09+)
        await _handle_reaction_picker_v10(page, main_frame)
        await random_delay(0.5, 1)

        # 여러 방법으로 상태 재검증
        after_state = await main_frame.evaluate('''() => {
            const sels = ['.area_sympathy .u_likeit_btn', '.u_likeit_btn', 'a[role="button"][class*="like"]', 'button[class*="like"]'];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) {
                    return {
                        isOn: el.classList.contains('on'),
                        isPressed: el.getAttribute('aria-pressed') === 'true',
                        hasActive: el.classList.contains('is_on') || el.classList.contains('active'),
                        count: el.querySelector('.u_cnt, [class*="count"], em')?.innerText || '0',
                    };
                }
            }
            return null;
        }''')

        if after_state and (after_state.get('isOn') or after_state.get('isPressed') or after_state.get('hasActive')):
            result["success"] = True
            logger.info(f"공감 클릭 성공 (count: {after_state.get('count')})")
        elif after_state and after_state.get('count') != initial_state.get('count'):
            # 카운트가 증가했으면 성공으로 간주
            result["success"] = True
            logger.info(f"공감 성공 (카운트 변경: {initial_state.get('count')} → {after_state.get('count')})")
        else:
            result["error"] = "공감 상태 변경 실패"
            # 디버그 스크린샷
            try:
                await capture_debug(page, f"like_fail_{int(asyncio.get_event_loop().time())}")
            except Exception:
                pass

    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"좋아요 처리 중 예외: {e}")

    return result


async def _handle_reaction_picker_v10(page, main_frame):
    """2025.09+ 리액션 피커 레이어에서 첫 번째 리액션 선택"""
    try:
        for target in [main_frame, page]:
            layer = await target.query_selector('.u_likeit_layer, [class*="likeit_layer"]')
            if layer and await layer.is_visible():
                items = await layer.query_selector_all('button, a')
                if items:
                    await items[0].click()
                    return True
    except Exception:
        pass
    return False



# ──────────────────────────────────────────────────────────────
# Legacy compatibility (이전 인터페이스 유지)
# ──────────────────────────────────────────────────────────────

async def crawl_neighbor_feed(account: dict, max_posts: int = 20) -> list:
    """이전 API 호환 — ThemePost 기반 포스트 수집"""
    proxy = await _get_proxy_for_account(account.get("id", 0))
    headless = getattr(settings, "HEADLESS", True)

    async with async_playwright() as p:
        browser, context = await create_stealth_context(p, proxy=proxy, headless=headless)
        try:
            ok = await login(
                context,
                naver_id=account["naver_id"],
                naver_password=account["naver_password"],
                account_id=account.get("id", 0),
            )
            if not ok:
                return []

            page = await context.new_page()
            posts = await collect_blog_posts(page, max_posts=max_posts)

            # 프론트 포맷으로 변환
            return [
                {
                    "id": str(idx),
                    "blogName": p["url"].split("blog.naver.com/")[-1].split("/")[0] if "blog.naver.com/" in p["url"] else "",
                    "title": p["title"],
                    "url": p["url"],
                    "timeAgo": "",
                    "liked": False,
                    "commented": False,
                }
                for idx, p in enumerate(posts)
            ]
        except Exception as e:
            logger.error(f"crawl_neighbor_feed 오류: {e}")
            return []
        finally:
            try:
                await browser.close()
            except Exception:
                pass
