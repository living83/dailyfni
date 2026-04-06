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
        "commented": False,
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

            # 좋아요
            if actions.get("like"):
                like_res = await click_like(page)
                result["liked"] = like_res["success"]
                if like_res.get("error"):
                    result["error"] = like_res["error"]

            # 댓글
            comment_text = actions.get("comment")
            if comment_text:
                api_result = await write_comment_via_api(page, comment_text)
                if api_result["success"]:
                    result["commented"] = True
                else:
                    ui_result = await write_comment_ui(page, comment_text)
                    result["commented"] = ui_result["success"]
                    if not ui_result["success"]:
                        result["error"] = f"댓글 실패 (API: {api_result['error']}, UI: {ui_result['error']})"

            result["success"] = result["liked"] or result["commented"]

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
    config: { engagement_max_posts, engagement_do_like, engagement_do_comment }
    """
    account_id = account.get("id", 0)
    proxy = await _get_proxy_for_account(account_id)
    result_base = {
        "account_id": account_id,
        "total_posts": 0,
        "like_count": 0,
        "comment_count": 0,
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

            page = await context.new_page()

            max_posts = config.get("engagement_max_posts", 10)
            post_items = await collect_blog_posts(page, max_posts=max_posts)
            result_base["total_posts"] = len(post_items)

            if not post_items:
                result_base["error"] = "참여할 포스팅을 수집하지 못했습니다."
                return result_base

            logger.info(f"[계정 {account_id}] {len(post_items)}개 포스팅 순회 시작")

            api_key = os.getenv("ANTHROPIC_API_KEY", "") or getattr(settings, "ANTHROPIC_API_KEY", "")

            for i, item in enumerate(post_items):
                post_url = item.get("url") if isinstance(item, dict) else str(item)
                post_title = item.get("title", "") if isinstance(item, dict) else ""

                logger.info(f"[{i+1}/{len(post_items)}] {post_title[:30]}")

                post_result = await engage_single_post(
                    page=page,
                    post_url=post_url,
                    do_like=config.get("engagement_do_like", True),
                    do_comment=config.get("engagement_do_comment", True),
                    api_key=api_key,
                )

                result_base["results"].append(post_result)
                if post_result.get("like_success"):
                    result_base["like_count"] += 1
                if post_result.get("comment_success"):
                    result_base["comment_count"] += 1

                if i < len(post_items) - 1:
                    await random_delay(8, 15)

            logger.info(f"[계정 {account_id}] 완료 — 공감 {result_base['like_count']}, 댓글 {result_base['comment_count']}")

        except Exception as e:
            logger.exception(f"[계정 {account_id}] 배치 참여 예외: {e}")
            result_base["error"] = str(e)
        finally:
            try:
                await browser.close()
            except Exception:
                pass

    return result_base


async def engage_single_post(page: Page, post_url: str, do_like: bool, do_comment: bool, api_key: str) -> dict:
    """단일 포스팅에 대해 공감 및 댓글 참여"""
    res = {
        "post_url": post_url,
        "post_title": "",
        "like_success": False,
        "comment_success": False,
        "comment_text": "",
        "error": None,
    }

    try:
        await page.goto(post_url, wait_until="load", timeout=20000)
        await random_delay(2, 4)

        if not await is_actual_post_page(page):
            res["error"] = "유효한 포스트 페이지가 아닙니다 (스킵)"
            return res

        # 본문/제목 추출 (mainFrame 내부)
        main_frame = next((f for f in page.frames if f.name == 'mainFrame'), page)
        post_data = await main_frame.evaluate('''() => {
            const titleEl = document.querySelector('.se-title-text, .pcol1, h3.se_textarea');
            const contentEl = document.querySelector('.se-main-container, #postViewArea, #post-view');
            return {
                title: titleEl ? titleEl.innerText.trim() : '',
                content: contentEl ? contentEl.innerText.substring(0, 1000).trim() : ''
            };
        }''')
        res["post_title"] = post_data["title"]

        # 공감
        if do_like:
            like_res = await click_like(page)
            res["like_success"] = like_res["success"]
            if like_res.get("error"):
                res["error"] = like_res["error"]

        # 댓글
        if do_comment:
            if not api_key:
                res["error"] = "AI API Key 미설정 (댓글 스킵)"
            elif not post_data["content"]:
                res["error"] = "본문 추출 실패 (댓글 스킵)"
            else:
                comment_text = await generate_engagement_comment(api_key, post_data["title"], post_data["content"])
                res["comment_text"] = comment_text or ""

                if comment_text:
                    api_comment = await write_comment_via_api(page, comment_text)
                    if api_comment["success"]:
                        res["comment_success"] = True
                    else:
                        ui_comment = await write_comment_ui(page, comment_text)
                        res["comment_success"] = ui_comment["success"]
                        if not ui_comment["success"]:
                            res["error"] = f"댓글 실패 (API: {api_comment['error']}, UI: {ui_comment['error']})"
                else:
                    res["error"] = "AI 댓글 생성 실패"

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
    """공감(좋아요) 클릭 — mainFrame + 리액션 피커 대응"""
    result = {"success": False, "error": ""}
    try:
        main_frame = next((f for f in page.frames if f.name == 'mainFrame'), page)

        like_btn_selectors = [
            '.area_sympathy .u_likeit_btn',
            '.u_likeit_btn',
            'a[role="button"][class*="like"]',
            'button[class*="like"]',
        ]

        like_btn = None
        for sel in like_btn_selectors:
            like_btn = await main_frame.query_selector(sel)
            if like_btn and await like_btn.is_visible():
                break

        if not like_btn:
            await main_frame.evaluate('window.scrollBy(0, 3000)')
            await random_delay(1, 1.5)
            for sel in like_btn_selectors:
                like_btn = await main_frame.query_selector(sel)
                if like_btn and await like_btn.is_visible():
                    break

        if not like_btn:
            return {"success": False, "error": "좋아요 버튼 미발견"}

        is_on = await like_btn.evaluate('el => el.classList.contains("on")')
        if is_on:
            logger.info("이미 공감된 포스팅")
            return {"success": True, "already": True}

        await like_btn.scroll_into_view_if_needed()
        await like_btn.click()
        await random_delay(1, 2)

        await _handle_reaction_picker_v10(page, main_frame)

        is_on_after = await like_btn.evaluate('el => el.classList.contains("on")')
        if is_on_after:
            result["success"] = True
            logger.info("공감 클릭 성공")
        else:
            result["error"] = "공감 상태 변경 실패"

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


async def write_comment_via_api(page: Page, comment_text: str) -> dict:
    """cbox5 API 직접 호출 (핵심 — UI보다 안정적)"""
    try:
        main_frame = next((f for f in page.frames if f.name == 'mainFrame'), page)
        meta = await main_frame.evaluate(r'''() => {
            const url = window.location.href;
            const blogId = (url.match(/blog\.naver\.com\/([^\/\?#]+)/) || [])[1];
            const logNo = (url.match(/\/(\d{8,})/) || url.match(/logNo=(\d+)/) || [])[1];
            return { blogId, logNo };
        }''')

        if not meta['blogId'] or not meta['logNo']:
            return {"success": False, "error": "ID/번호 추출 실패"}

        payload = {"blogId": meta['blogId'], "logNo": meta['logNo'], "content": comment_text}
        ok = await main_frame.evaluate('''async ({blogId, logNo, content}) => {
            try {
                const url = `https://cbox5.apis.naver.com/comment/v1/write.json?ticket=blog&pool=cbox5&lang=ko&country=KR&objectId=blog_${blogId}_${logNo}`;
                const body = new URLSearchParams();
                body.append('contents', content);
                body.append('openType', 'on');
                const resp = await fetch(url, { method: 'POST', body: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                const data = await resp.json();
                return { success: data.success, message: data.message };
            } catch (e) { return { success: false, message: e.toString() }; }
        }''', payload)

        return {"success": ok['success'], "error": ok.get('message', '')}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def write_comment_ui(page: Page, comment_text: str) -> dict:
    """UI 조작 댓글 (API 폴백)"""
    try:
        main_frame = next((f for f in page.frames if f.name == 'mainFrame'), page)
        await main_frame.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await random_delay(1, 2)

        cbox_frame = None
        for f in page.frames:
            if 'cbox' in (f.name or '') or 'comment' in (f.url or ''):
                cbox_frame = f
                break

        target = cbox_frame or main_frame

        textarea = await try_selectors(target, ['.u_cbox_text', 'textarea[class*="cbox"]'], timeout=5000)
        if textarea:
            await textarea.click()
            await textarea.fill(comment_text)
            await random_delay(0.5, 1)

            submit = await try_selectors(target, ['.u_cbox_btn_upload', 'button:has-text("등록")'], timeout=3000)
            if submit:
                await submit.click()
                await random_delay(2, 3)
                return {"success": True}

        return {"success": False, "error": "댓글 입력창 또는 등록 버튼 미발견"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def generate_engagement_comment(api_key: str, title: str, content: str) -> Optional[str]:
    """Claude AI 이웃 댓글 생성"""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        prompt = f"""
다음 블로그 포스팅의 제목과 본문(일부)을 읽고, 이웃으로서 '공감하는 댓글'을 한 문장 또는 두 문장으로 짧고 자연스럽게 작성해줘.
절대 취소선(~~)이나 특수 기호를 사용하지 말고, 평범한 구어체(~네요, ~예요 등)를 사용해줘. 광고 느낌이나 무성의한 복붙 느낌은 피해줘.

제목: {title}
본문: {content}

댓글:
"""
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        comment = response.content[0].text.strip()
        comment = re.sub(r'["\']', '', comment).replace('댓글:', '').strip()
        return comment
    except Exception as e:
        logger.error(f"AI 댓글 생성 오류: {e}")
        return None


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
