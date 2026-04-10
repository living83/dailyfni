"""
buddy.py — 네이버 블로그 서로이웃 자동 수락 엔진
Playwright를 사용하여 로그인 후 서로이웃 신청을 일괄 수락합니다.
"""

import asyncio
import random
from typing import Optional

from loguru import logger
from playwright.async_api import async_playwright

from browser.se_helpers import (
    _get_proxy_for_account,
    create_stealth_context,
    login,
    random_delay,
)
from config import settings

CODE_VERSION = "2026-04-10-v1-buddy"

BUDDY_ADMIN_URL = "https://admin.blog.naver.com/BothBuddyListForm.nhn"


async def get_pending_count(account: dict) -> dict:
    """
    서로이웃 대기 신청 수를 조회합니다.
    Returns: { success, pending_count, error }
    """
    result = {"success": False, "pending_count": 0, "error": None}
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
            blog_id = account["naver_id"]

            # 서로이웃 관리 페이지 접근
            url = f"{BUDDY_ADMIN_URL}?blogId={blog_id}"
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await random_delay(2, 3)

            # 받은신청 탭에서 행 개수 카운트
            rows = await page.query_selector_all(
                "table.buddy_list tbody tr, .buddy_lst li, .bdy_lst tr"
            )
            count = len(rows) if rows else 0

            # 페이지 텍스트에서 숫자 추출 시도 (예: "서로이웃 신청 29")
            try:
                text = await page.inner_text("body")
                import re
                m = re.search(r'서로이웃\s*신청\s*(\d+)', text)
                if m:
                    count = max(count, int(m.group(1)))
            except Exception:
                pass

            result["success"] = True
            result["pending_count"] = count
            logger.info(f"[{account.get('account_name', blog_id)}] 서로이웃 대기: {count}건")

        except Exception as e:
            logger.exception(f"get_pending_count 예외: {e}")
            result["error"] = str(e)
        finally:
            try:
                await context.close()
                await browser.close()
            except Exception:
                pass

    return result


async def accept_buddy_requests(account: dict, config: dict) -> dict:
    """
    서로이웃 신청을 일괄 수락합니다.

    Args:
        account: { id, naver_id, naver_password, account_name }
        config: { max_accept: int, accept_mode: 'all' | 'with_message' }

    Returns: { success, accepted_count, skipped_count, error }
    """
    result = {
        "success": False,
        "accepted_count": 0,
        "skipped_count": 0,
        "error": None,
    }
    max_accept = config.get("max_accept", 50)
    accept_mode = config.get("accept_mode", "all")
    proxy = await _get_proxy_for_account(account.get("id", 0))
    headless = getattr(settings, "HEADLESS", True)
    account_name = account.get("account_name", account["naver_id"])

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
            blog_id = account["naver_id"]
            url = f"{BUDDY_ADMIN_URL}?blogId={blog_id}"

            logger.info(f"[{account_name}] 서로이웃 관리 페이지 접근: {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await random_delay(2, 3)

            # ── 받은신청 탭 클릭 (이미 기본 탭일 수 있음) ──
            try:
                recv_tab = await page.query_selector(
                    'a:has-text("받은신청"), [class*="tab"]:has-text("받은신청")'
                )
                if recv_tab:
                    await recv_tab.click()
                    await random_delay(1, 2)
            except Exception:
                pass

            # ── 신청 행 수집 ──
            row_selectors = [
                "table.buddy_list tbody tr",
                ".bdy_lst tbody tr",
                "table tbody tr:has(input[type='checkbox'])",
            ]
            rows = []
            for sel in row_selectors:
                rows = await page.query_selector_all(sel)
                if rows:
                    break

            if not rows:
                logger.info(f"[{account_name}] 수락할 서로이웃 신청이 없습니다.")
                result["success"] = True
                result["accepted_count"] = 0
                return result

            total_pending = len(rows)
            to_accept = min(total_pending, max_accept)
            logger.info(f"[{account_name}] 서로이웃 신청 {total_pending}건 발견, 최대 {to_accept}건 수락 예정")

            # ── 체크박스 선택 ──
            checked = 0
            for i, row in enumerate(rows):
                if checked >= to_accept:
                    break

                # 메시지 있는 신청만 필터링
                if accept_mode == "with_message":
                    try:
                        msg_cell = await row.query_selector("td:nth-child(2), .msg, .message")
                        msg_text = (await msg_cell.inner_text()).strip() if msg_cell else ""
                        if not msg_text:
                            result["skipped_count"] += 1
                            continue
                    except Exception:
                        pass

                try:
                    checkbox = await row.query_selector("input[type='checkbox']")
                    if checkbox:
                        is_checked = await checkbox.is_checked()
                        if not is_checked:
                            await checkbox.click()
                            await asyncio.sleep(0.1)
                        checked += 1
                except Exception as e:
                    logger.debug(f"체크박스 클릭 실패 (row {i}): {e}")

            if checked == 0:
                logger.info(f"[{account_name}] 선택된 신청이 없습니다.")
                result["success"] = True
                return result

            logger.info(f"[{account_name}] {checked}건 체크 완료, 수락 버튼 클릭")

            # ── 수락 버튼 클릭 ──
            accept_btn = await page.query_selector(
                'a:has-text("수락"), button:has-text("수락"), '
                'input[value="수락"], .btn_accept, [class*="accept"]'
            )
            if not accept_btn:
                # 전체 선택 후 상단 수락 버튼 시도
                select_all = await page.query_selector(
                    'th input[type="checkbox"], .check_all input'
                )
                if select_all:
                    await select_all.click()
                    await random_delay(0.5, 1)
                accept_btn = await page.query_selector(
                    'a:has-text("수락"), button:has-text("수락"), input[value="수락"]'
                )

            if not accept_btn:
                result["error"] = "수락 버튼을 찾을 수 없습니다."
                return result

            await accept_btn.click()
            await random_delay(2, 3)

            # ── 팝업 "서로이웃 맺기" → 확인 클릭 ──
            confirm_selectors = [
                'button:has-text("확인")',
                'input[value="확인"]',
                'a:has-text("확인")',
                '.btn_ok',
                '[class*="confirm"] button',
                '[class*="popup"] button:has-text("확인")',
            ]

            confirmed = False
            # 팝업이 새 페이지로 뜰 수 있음 (BothBuddyMultiAcceptForm)
            for target in [page] + list(context.pages):
                for sel in confirm_selectors:
                    try:
                        btn = await target.query_selector(sel)
                        if btn and await btn.is_visible():
                            await btn.click()
                            confirmed = True
                            logger.info(f"[{account_name}] 확인 버튼 클릭 완료")
                            break
                    except Exception:
                        continue
                if confirmed:
                    break

            # 새 팝업 윈도우가 열릴 수 있음
            if not confirmed:
                try:
                    popup = await page.wait_for_event("popup", timeout=5000)
                    await popup.wait_for_load_state("domcontentloaded")
                    await random_delay(1, 2)
                    for sel in confirm_selectors:
                        btn = await popup.query_selector(sel)
                        if btn:
                            await btn.click()
                            confirmed = True
                            logger.info(f"[{account_name}] 팝업 윈도우에서 확인 클릭")
                            break
                except Exception:
                    pass

            if not confirmed:
                # 최후 수단: 페이지 전체에서 확인 버튼 검색
                await random_delay(1, 2)
                try:
                    await page.click('button:has-text("확인"), input[value="확인"]', timeout=5000)
                    confirmed = True
                except Exception:
                    logger.warning(f"[{account_name}] 확인 버튼을 찾지 못했습니다 (수락은 진행됐을 수 있음)")

            await random_delay(1, 2)

            result["success"] = True
            result["accepted_count"] = checked
            logger.info(f"[{account_name}] 서로이웃 {checked}건 수락 완료")

        except Exception as e:
            logger.exception(f"accept_buddy_requests 예외: {e}")
            result["error"] = str(e)
        finally:
            try:
                await context.close()
                await browser.close()
            except Exception:
                pass

    return result
