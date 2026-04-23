"""
tistory_helpers.py — 카카오 로그인 + 티스토리 공용 유틸리티
"""

import asyncio
from pathlib import Path
from typing import Optional

from loguru import logger
from playwright.async_api import BrowserContext, Page

from browser.se_helpers import (
    _get_proxy_for_account,
    _load_encrypted_cookies,
    _save_encrypted_cookies,
    capture_debug,
    create_stealth_context,
    random_delay,
)
from config import settings


async def kakao_login(
    context: BrowserContext,
    kakao_id: str,
    kakao_password: str,
    account_id: str,
) -> bool:
    """
    카카오 계정으로 로그인 (쿠키 → ID/PW 2단계 전략)
    성공 시 True, 실패 시 False
    """
    page = await context.new_page()
    cookie_path = settings.COOKIES_DIR / f"tistory_{account_id}.enc"

    # ── Step 1: 쿠키 로그인 시도 ──
    if cookie_path.exists():
        try:
            cookies = _load_encrypted_cookies(cookie_path)
            await context.add_cookies(cookies)
            await page.goto("https://www.tistory.com/", timeout=30000)
            await page.wait_for_load_state("domcontentloaded")
            await random_delay(1, 2)

            # 로그인 상태 확인 — 로그인 버튼이 없으면 성공
            login_btn = await page.query_selector(
                'a[href*="login"], .btn_login, a:has-text("로그인")'
            )
            if not login_btn:
                logger.info(f"[티스토리 {account_id}] 쿠키 로그인 성공")
                await page.close()
                return True
            logger.debug(f"[티스토리 {account_id}] 쿠키 만료 → ID/PW 로그인")
        except Exception as e:
            logger.warning(f"[티스토리 {account_id}] 쿠키 로드 실패: {e}")

    # ── Step 2: 카카오 로그인 페이지 ──
    for attempt in range(1, 4):
        try:
            logger.info(f"[티스토리 {account_id}] 카카오 로그인 시도 {attempt}/3")

            # 티스토리 로그인 → 카카오 로그인 페이지로 리다이렉트
            await page.goto("https://www.tistory.com/auth/login", timeout=30000)
            await page.wait_for_load_state("domcontentloaded")
            await random_delay(1, 2)

            # 카카오 로그인 버튼 클릭 (이미 카카오 페이지일 수도 있음)
            kakao_btn = await page.query_selector(
                'a[href*="kakao"], .btn_kakao, a:has-text("카카오"), '
                'button:has-text("카카오")'
            )
            if kakao_btn:
                await kakao_btn.click()
                await page.wait_for_load_state("domcontentloaded", timeout=15000)
                await random_delay(1, 2)

            # 카카오 로그인 폼이 나올 때까지 대기
            current_url = page.url
            if "accounts.kakao.com" not in current_url:
                # 직접 카카오 로그인 페이지로 이동
                await page.goto(
                    "https://accounts.kakao.com/login/?continue=https://www.tistory.com/",
                    timeout=30000
                )
                await page.wait_for_load_state("domcontentloaded")
                await random_delay(1, 2)

            # 이메일/아이디 입력
            id_field = await page.query_selector(
                '#loginId--1, input[name="loginId"], input[name="email"], '
                'input[placeholder*="이메일"], input[placeholder*="아이디"]'
            )
            if not id_field:
                logger.warning(f"[티스토리 {account_id}] 카카오 ID 입력 필드 못 찾음 (시도 {attempt})")
                await capture_debug(page, f"tistory_kakao_no_id_{account_id}_{attempt}")
                await random_delay(2, 3)
                continue

            # JS native setter로 입력 (봇 탐지 우회)
            await page.evaluate(f"""
                const field = document.querySelector('#loginId--1, input[name="loginId"], input[name="email"]');
                if (field) {{
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeSetter.call(field, '{kakao_id}');
                    field.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    field.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            """)
            await random_delay(0.5, 1.0)

            # "다음" 또는 비밀번호 입력으로 진행
            next_btn = await page.query_selector(
                'button:has-text("다음"), button:has-text("로그인"), '
                'button[type="submit"], .btn_confirm'
            )
            if next_btn:
                await next_btn.click()
                await random_delay(1, 2)

            # 비밀번호 입력
            pw_field = await page.query_selector(
                '#password--2, input[name="password"], input[type="password"]'
            )
            if pw_field:
                await page.evaluate(f"""
                    const field = document.querySelector('#password--2, input[name="password"], input[type="password"]');
                    if (field) {{
                        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        nativeSetter.call(field, '{kakao_password}');
                        field.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        field.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    }}
                """)
                await random_delay(0.5, 1.0)

                # 로그인 버튼 클릭
                login_submit = await page.query_selector(
                    'button:has-text("로그인"), button[type="submit"], .btn_confirm'
                )
                if login_submit:
                    await login_submit.click()
                else:
                    await page.keyboard.press("Enter")

                await random_delay(3, 5)

            # 로그인 성공 확인
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
            current_url = page.url

            # 카카오 인증/동의 페이지 처리
            if "accounts.kakao.com" in current_url:
                # 동의 버튼이 있으면 클릭
                agree_btn = await page.query_selector(
                    'button:has-text("동의"), button:has-text("확인"), '
                    'button:has-text("계속")'
                )
                if agree_btn:
                    await agree_btn.click()
                    await random_delay(2, 3)
                    current_url = page.url

            # 티스토리로 돌아왔는지 확인
            if "tistory.com" in current_url and "login" not in current_url:
                logger.info(f"[티스토리 {account_id}] 카카오 로그인 성공")
                # 쿠키 저장
                try:
                    cookies = await context.cookies()
                    _save_encrypted_cookies(cookies, cookie_path)
                    logger.debug(f"[티스토리 {account_id}] 쿠키 저장 완료")
                except Exception as e:
                    logger.debug(f"쿠키 저장 실패: {e}")
                await page.close()
                return True

            # 에러 감지
            page_text = await page.evaluate("() => document.body?.innerText || ''")
            if "비밀번호" in page_text and "일치" in page_text:
                logger.error(f"[티스토리 {account_id}] 비밀번호 불일치")
                await page.close()
                return False
            if "차단" in page_text or "제한" in page_text:
                logger.error(f"[티스토리 {account_id}] 계정 차단/제한")
                await page.close()
                return False

            logger.warning(f"[티스토리 {account_id}] 로그인 상태 불확실: {current_url}")
            await capture_debug(page, f"tistory_login_uncertain_{account_id}_{attempt}")

        except Exception as e:
            logger.error(f"[티스토리 {account_id}] 로그인 시도 {attempt} 예외: {e}")
            await capture_debug(page, f"tistory_login_error_{account_id}_{attempt}")

    await page.close()
    return False
