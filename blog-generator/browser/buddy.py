"""
buddy.py — 네이버 블로그 서로이웃 자동 수락 엔진
Playwright를 사용하여 로그인 후 서로이웃 신청을 일괄 수락합니다.
"""

import asyncio
import random
from pathlib import Path
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

BUDDY_ADMIN_URL = "https://admin.blog.naver.com/{blog_id}/buddy/relation"


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
            url = BUDDY_ADMIN_URL.format(blog_id=blog_id)
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
            url = BUDDY_ADMIN_URL.format(blog_id=blog_id)

            logger.info(f"[{account_name}] 서로이웃 관리 페이지 접근: {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await random_delay(2, 3)

            # 디버그: URL + 스크린샷 + HTML 저장
            actual_url = page.url
            logger.info(f"[{account_name}] 실제 URL: {actual_url}")
            debug_dir = Path(settings.IMAGES_DIR) / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            try:
                await page.screenshot(path=str(debug_dir / f"buddy_{blog_id}.png"), full_page=True)
                html_content = await page.content()
                (debug_dir / f"buddy_{blog_id}.html").write_text(html_content, encoding="utf-8")
                logger.info(f"[{account_name}] 디버그 저장 완료: {debug_dir}")
            except Exception as e:
                logger.debug(f"디버그 저장 실패: {e}")

            # ── 받은신청 탭 확인 (기본 탭) ──
            try:
                recv_tab = await page.query_selector('a:has-text("받은신청")')
                if recv_tab:
                    await recv_tab.click()
                    await random_delay(1, 2)
            except Exception:
                pass

            # ── 신청 건수 확인 ──
            checkboxes = await page.query_selector_all("input[type='checkbox']")
            # 첫 번째는 헤더 전체선택, 마지막도 전체선택일 수 있음
            # 중간의 체크박스가 실제 신청 행
            logger.info(f"[{account_name}] 체크박스 총 {len(checkboxes)}개 발견")

            if len(checkboxes) <= 2:
                # 전체선택 체크박스만 있고 신청 행이 없음
                logger.info(f"[{account_name}] 수락할 서로이웃 신청이 없습니다.")
                result["success"] = True
                result["accepted_count"] = 0
                return result

            # ── "전체선택" 클릭 → "수락" 클릭 (하단 배치 버튼 사용) ──
            # 페이지 하단의 "전체선택" 체크박스를 찾아 클릭
            select_all_clicked = False

            # 방법 1: 하단 "전체선택" 텍스트 옆 체크박스
            try:
                select_all_label = await page.query_selector('text=전체선택')
                if select_all_label:
                    # 전체선택 텍스트 근처의 체크박스 클릭
                    parent = await select_all_label.evaluate_handle('el => el.parentElement')
                    cb = await parent.as_element().query_selector("input[type='checkbox']")
                    if cb:
                        await cb.click()
                        select_all_clicked = True
                        logger.info(f"[{account_name}] 하단 전체선택 체크박스 클릭")
            except Exception as e:
                logger.debug(f"전체선택 방법1 실패: {e}")

            # 방법 2: 마지막 체크박스가 전체선택인 경우
            if not select_all_clicked and len(checkboxes) >= 2:
                try:
                    last_cb = checkboxes[-1]
                    await last_cb.click()
                    select_all_clicked = True
                    logger.info(f"[{account_name}] 마지막 체크박스(전체선택) 클릭")
                except Exception as e:
                    logger.debug(f"전체선택 방법2 실패: {e}")

            # 방법 3: 첫 번째 체크박스(헤더 전체선택) 클릭
            if not select_all_clicked and len(checkboxes) >= 1:
                try:
                    await checkboxes[0].click()
                    select_all_clicked = True
                    logger.info(f"[{account_name}] 첫 번째 체크박스(헤더 전체선택) 클릭")
                except Exception as e:
                    logger.debug(f"전체선택 방법3 실패: {e}")

            await random_delay(0.5, 1)

            # 체크된 개수 확인
            checked_count = 0
            for cb in checkboxes:
                try:
                    if await cb.is_checked():
                        checked_count += 1
                except Exception:
                    pass
            logger.info(f"[{account_name}] 체크된 항목: {checked_count}개")

            # ── "수락" 버튼 클릭 (하단 배치 수락 버튼) ──
            accept_clicked = False

            # 하단 "전체선택 | 수락 | 거절" 영역의 수락 버튼
            accept_selectors = [
                'text=전체선택 >> .. >> text=수락',     # 전체선택 옆의 수락
                'input[value="수락"]',                  # input 버튼
                'button:has-text("수락")',              # button
                'a:has-text("수락")',                   # link
            ]
            # 개별 행의 수락 링크가 아닌, 하단 배치 수락 버튼만 타겟
            # 페이지에서 "수락" 텍스트가 여러 개 있으므로 하단 것을 우선
            try:
                # 하단 영역 (전체선택과 같은 레벨)에 있는 수락 버튼 찾기
                all_accept_links = await page.query_selector_all('a:has-text("수락"), button:has-text("수락"), input[value="수락"]')
                if all_accept_links:
                    # 마지막 수락 버튼이 하단 배치 버튼 (개별 행 수락은 위쪽에 있음)
                    target_btn = all_accept_links[-1]
                    await target_btn.click()
                    accept_clicked = True
                    logger.info(f"[{account_name}] 하단 수락 버튼 클릭 (총 {len(all_accept_links)}개 중 마지막)")
            except Exception as e:
                logger.warning(f"[{account_name}] 수락 버튼 클릭 실패: {e}")

            if not accept_clicked:
                result["error"] = "수락 버튼을 찾을 수 없습니다."
                return result

            await random_delay(2, 3)

            # ── 팝업 "서로이웃 맺기" → 확인 클릭 ──
            # BothBuddyMultiAcceptForm.naver 팝업이 뜸
            confirmed = False

            # 팝업 윈도우 대기
            try:
                popup = await page.wait_for_event("popup", timeout=5000)
                await popup.wait_for_load_state("domcontentloaded")
                await random_delay(1, 2)
                logger.info(f"[{account_name}] 팝업 URL: {popup.url}")

                # 팝업에서 "확인" 클릭
                confirm_btn = await popup.query_selector(
                    'button:has-text("확인"), input[value="확인"], a:has-text("확인")'
                )
                if confirm_btn:
                    await confirm_btn.click()
                    confirmed = True
                    logger.info(f"[{account_name}] 팝업에서 확인 클릭 완료")
                await random_delay(1, 2)
            except Exception as e:
                logger.debug(f"팝업 대기 실패: {e}")

            # 팝업이 아닌 같은 페이지 내 모달일 수 있음
            if not confirmed:
                try:
                    await page.click(
                        'button:has-text("확인"), input[value="확인")',
                        timeout=5000
                    )
                    confirmed = True
                    logger.info(f"[{account_name}] 페이지 내 확인 클릭")
                except Exception:
                    pass

            # alert 대화상자 처리
            if not confirmed:
                try:
                    page.on("dialog", lambda dialog: dialog.accept())
                    await random_delay(1, 2)
                except Exception:
                    pass

            await random_delay(1, 2)

            # 수락된 개수 = 전체 체크박스 - 2(전체선택 상하단) or checked_count
            accepted = max(checked_count - 2, len(checkboxes) - 2)
            if accepted < 0:
                accepted = 0

            result["success"] = True
            result["accepted_count"] = accepted
            logger.info(f"[{account_name}] 서로이웃 약 {accepted}건 수락 완료")

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
