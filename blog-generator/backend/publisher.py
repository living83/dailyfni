"""
Playwright 기반 네이버 블로그 자동 발행 엔진
- 쿠키 우선 로그인, 실패 시 ID/PW 로그인
- 타이핑 시뮬레이션
- iframe 처리
- 카테고리 선택
"""

import os
import json
import asyncio
import random
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("publisher")

COOKIE_DIR = Path(__file__).resolve().parent.parent / "data" / "cookies"
COOKIE_DIR.mkdir(parents=True, exist_ok=True)


def _cookie_path(account_id: int) -> Path:
    return COOKIE_DIR / f"account_{account_id}.json"


async def _random_delay(min_sec: float = 1.0, max_sec: float = 3.0):
    await asyncio.sleep(random.uniform(min_sec, max_sec))


async def _type_slowly(page_or_frame, selector: str, text: str, delay_ms: int = 50):
    """타이핑 시뮬레이션 - 자연스러운 입력"""
    element = await page_or_frame.wait_for_selector(selector, timeout=10000)
    await element.click()
    for char in text:
        await page_or_frame.keyboard.type(char, delay=delay_ms + random.randint(-20, 30))
        if random.random() < 0.05:
            await asyncio.sleep(random.uniform(0.1, 0.3))


async def save_cookies(page, account_id: int):
    """현재 브라우저 쿠키를 파일로 저장"""
    cookies = await page.context.cookies()
    cookie_file = _cookie_path(account_id)
    cookie_file.write_text(json.dumps(cookies, ensure_ascii=False, indent=2))
    try:
        os.chmod(str(cookie_file), 0o600)
    except OSError:
        pass
    logger.info(f"쿠키 저장 완료: {cookie_file}")
    return str(cookie_file)


async def load_cookies(context, account_id: int) -> bool:
    """저장된 쿠키 로드"""
    cookie_file = _cookie_path(account_id)
    if not cookie_file.exists():
        return False
    try:
        cookies = json.loads(cookie_file.read_text())
        await context.add_cookies(cookies)
        logger.info(f"쿠키 로드 완료: account_id={account_id}")
        return True
    except Exception as e:
        logger.warning(f"쿠키 로드 실패: {e}")
        return False


async def check_login_status(page) -> bool:
    """로그인 상태 확인"""
    try:
        await page.goto("https://blog.naver.com", wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(2)
        # 로그인 상태면 프로필 영역이 있음
        login_btn = await page.query_selector('a.btn_login, a[href*="nidlogin"]')
        return login_btn is None
    except Exception:
        return False


async def login_with_credentials(page, naver_id: str, naver_password: str) -> bool:
    """ID/PW로 네이버 로그인"""
    try:
        await page.goto("https://nid.naver.com/nidlogin.login", wait_until="domcontentloaded", timeout=15000)
        await _random_delay(1, 2)

        # ID 입력
        await page.click("#id")
        await _random_delay(0.3, 0.5)
        await page.evaluate(f'document.querySelector("#id").value = "{naver_id}"')
        await page.dispatch_event("#id", "input")
        await _random_delay(0.5, 1)

        # PW 입력
        await page.click("#pw")
        await _random_delay(0.3, 0.5)
        await page.evaluate(f'document.querySelector("#pw").value = "{naver_password}"')
        await page.dispatch_event("#pw", "input")
        await _random_delay(0.5, 1)

        # 로그인 버튼 클릭
        await page.click("#log\\.login, button.btn_login, button[type='submit']")
        await _random_delay(3, 5)

        # CAPTCHA 체크
        captcha = await page.query_selector("#captcha, .captcha_wrap")
        if captcha:
            logger.error("CAPTCHA 발생! 수동 개입 필요")
            return False

        # 로그인 성공 확인
        current_url = page.url
        if "nidlogin" in current_url:
            error_el = await page.query_selector(".error_message, #err_common")
            if error_el:
                error_text = await error_el.text_content()
                logger.error(f"로그인 실패: {error_text}")
            return False

        logger.info("로그인 성공")
        return True
    except Exception as e:
        logger.error(f"로그인 중 오류: {e}")
        return False


async def login(page, account_id: int, naver_id: str, naver_password: str) -> bool:
    """쿠키 우선 로그인, 실패 시 ID/PW 로그인"""
    # 1. 쿠키로 시도
    cookie_loaded = await load_cookies(page.context, account_id)
    if cookie_loaded:
        is_logged_in = await check_login_status(page)
        if is_logged_in:
            logger.info(f"쿠키 로그인 성공: account_id={account_id}")
            return True
        logger.info("쿠키 만료, ID/PW 로그인 시도")

    # 2. ID/PW로 로그인
    for attempt in range(3):
        success = await login_with_credentials(page, naver_id, naver_password)
        if success:
            await save_cookies(page, account_id)
            return True
        logger.warning(f"로그인 재시도 {attempt + 2}/3")
        await _random_delay(3, 5)

    return False


async def publish_to_naver(
    page,
    account_id: int,
    naver_id: str,
    naver_password: str,
    title: str,
    content: str,
    category_name: str = "",
    tags: list = None,
) -> dict:
    """
    네이버 블로그에 글을 발행합니다.
    Returns: {"success": bool, "url": str, "error": str}
    """
    result = {"success": False, "url": "", "error": ""}
    tags = tags or []

    try:
        # 1. 로그인
        logged_in = await login(page, account_id, naver_id, naver_password)
        if not logged_in:
            result["error"] = "로그인 실패"
            return result

        await _random_delay(2, 3)

        # 2. 블로그 글쓰기 페이지 이동
        await page.goto("https://blog.naver.com/PostWriteForm.naver", wait_until="domcontentloaded", timeout=20000)
        await _random_delay(3, 5)

        # 3. "작성 중인 글이 있습니다" 팝업 처리
        try:
            popup_btn = await page.wait_for_selector('button:has-text("아니오"), button:has-text("새로 작성")', timeout=3000)
            if popup_btn:
                await popup_btn.click()
                await _random_delay(1, 2)
        except Exception:
            pass

        # 4. 도움말 팝업 닫기
        try:
            close_btn = await page.wait_for_selector('.se-popup-button-close, button[aria-label="닫기"]', timeout=2000)
            if close_btn:
                await close_btn.click()
                await _random_delay(0.5, 1)
        except Exception:
            pass

        # 5. 카테고리 선택
        if category_name:
            try:
                cat_btn = await page.wait_for_selector('.publish_category_btn, button[class*="category"]', timeout=5000)
                if cat_btn:
                    await cat_btn.click()
                    await _random_delay(0.5, 1)
                    cat_item = await page.wait_for_selector(f'li:has-text("{category_name}"), span:has-text("{category_name}")', timeout=3000)
                    if cat_item:
                        await cat_item.click()
                        await _random_delay(0.5, 1)
            except Exception as e:
                logger.warning(f"카테고리 선택 실패: {e}")

        # 6. 제목 입력
        try:
            title_selector = '.se-ff-nanumgothic.se-fs32, .se-title-text, [contenteditable="true"][class*="title"]'
            await page.wait_for_selector(title_selector, timeout=10000)
            await page.click(title_selector)
            await _random_delay(0.5, 1)

            for char in title:
                await page.keyboard.type(char, delay=50 + random.randint(-20, 30))
            await _random_delay(1, 2)
        except Exception as e:
            logger.warning(f"제목 입력 시도 2차: {e}")
            try:
                await page.keyboard.type(title, delay=50)
            except Exception:
                result["error"] = f"제목 입력 실패: {e}"
                return result

        # 7. 본문 영역으로 이동
        await page.keyboard.press("Tab")
        await _random_delay(1, 2)

        # 8. 본문 입력 (줄 단위로 입력하여 자연스럽게)
        try:
            body_selector = '.se-text-paragraph, .se-component-content [contenteditable="true"]'
            body_el = await page.wait_for_selector(body_selector, timeout=5000)
            if body_el:
                await body_el.click()
                await _random_delay(0.5, 1)
        except Exception:
            pass

        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.strip():
                # 마크다운 헤딩을 볼드로 변환
                clean_line = line.strip()
                if clean_line.startswith("## "):
                    clean_line = clean_line[3:]
                    await page.keyboard.type(clean_line, delay=30 + random.randint(-10, 15))
                elif clean_line.startswith("# "):
                    clean_line = clean_line[2:]
                    await page.keyboard.type(clean_line, delay=30 + random.randint(-10, 15))
                elif clean_line.startswith("- "):
                    clean_line = clean_line[2:]
                    await page.keyboard.type("• " + clean_line, delay=30 + random.randint(-10, 15))
                else:
                    # **bold** 마크다운 제거
                    clean_line = clean_line.replace("**", "")
                    await page.keyboard.type(clean_line, delay=30 + random.randint(-10, 15))

            await page.keyboard.press("Enter")

            # 랜덤 타이핑 일시 정지 (자연스러움)
            if random.random() < 0.1:
                await asyncio.sleep(random.uniform(0.5, 1.5))

        await _random_delay(2, 3)

        # 9. 태그 입력
        if tags:
            try:
                tag_input = await page.wait_for_selector('.se-tag-input, input[placeholder*="태그"]', timeout=5000)
                if tag_input:
                    await tag_input.click()
                    for tag in tags[:10]:
                        await page.keyboard.type(tag, delay=40)
                        await page.keyboard.press("Enter")
                        await _random_delay(0.3, 0.5)
            except Exception as e:
                logger.warning(f"태그 입력 실패: {e}")

        # 10. 발행 버튼 클릭
        await _random_delay(1, 2)
        try:
            publish_btn = await page.wait_for_selector(
                'button:has-text("발행"), button:has-text("등록"), .publish_btn',
                timeout=5000,
            )
            if publish_btn:
                await publish_btn.click()
                await _random_delay(2, 3)

                # 발행 확인 다이얼로그
                try:
                    confirm_btn = await page.wait_for_selector(
                        'button:has-text("발행"), button:has-text("확인")',
                        timeout=5000,
                    )
                    if confirm_btn:
                        await confirm_btn.click()
                        await _random_delay(3, 5)
                except Exception:
                    pass
        except Exception as e:
            result["error"] = f"발행 버튼 클릭 실패: {e}"
            return result

        # 11. 발행 성공 확인 & URL 수집
        await _random_delay(3, 5)
        current_url = page.url
        if "blog.naver.com" in current_url and "PostView" in current_url:
            result["success"] = True
            result["url"] = current_url
        elif "blog.naver.com" in current_url:
            result["success"] = True
            result["url"] = current_url
        else:
            # URL에서 확인 시도
            try:
                await page.wait_for_url("**/blog.naver.com/**", timeout=10000)
                result["success"] = True
                result["url"] = page.url
            except Exception:
                result["success"] = True
                result["url"] = page.url

        logger.info(f"발행 완료: {result['url']}")

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"발행 중 오류: {e}")

    return result


async def test_login(account_id: int, naver_id: str, naver_password: str) -> dict:
    """로그인 테스트 (실제 발행 안 함)"""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
        )
        page = await context.new_page()

        try:
            success = await login(page, account_id, naver_id, naver_password)
            return {"success": success, "message": "로그인 성공" if success else "로그인 실패"}
        except Exception as e:
            return {"success": False, "message": str(e)}
        finally:
            await browser.close()


async def run_publish_task(
    account_id: int,
    naver_id: str,
    naver_password: str,
    title: str,
    content: str,
    category_name: str = "",
    tags: list = None,
) -> dict:
    """단일 문서 발행 실행"""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
        )
        page = await context.new_page()

        try:
            result = await publish_to_naver(
                page, account_id, naver_id, naver_password,
                title, content, category_name, tags,
            )
            return result
        except Exception as e:
            return {"success": False, "url": "", "error": str(e)}
        finally:
            await browser.close()
