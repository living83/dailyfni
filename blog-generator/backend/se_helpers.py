"""
네이버 SmartEditor ONE 공용 헬퍼 함수
- 로그인 / 쿠키 관리
- 스텔스 브라우저 생성
- SE ONE 에디터 공통 조작 (iframe, 팝업, 제목, 본문, 이미지, 링크, 태그, 발행)
- blog_publisher.py / cafe_publisher.py 에서 공용으로 사용
"""

import os
import sys
import json
import asyncio
import random
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("se_helpers")

COOKIE_DIR = Path(__file__).resolve().parent.parent / "data" / "cookies"
COOKIE_DIR.mkdir(parents=True, exist_ok=True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 유틸리티
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _run_in_proactor_loop(coro_func, *args, **kwargs):
    """Windows에서 ProactorEventLoop을 사용하여 코루틴 실행."""
    loop = asyncio.ProactorEventLoop()
    try:
        return loop.run_until_complete(coro_func(*args, **kwargs))
    finally:
        loop.close()


async def random_delay(min_sec: float = 1.0, max_sec: float = 3.0):
    await asyncio.sleep(random.uniform(min_sec, max_sec))


async def type_slowly(page_or_frame, selector: str, text: str, delay_ms: int = 50):
    """타이핑 시뮬레이션 - 자연스러운 입력"""
    element = await page_or_frame.wait_for_selector(selector, timeout=10000)
    await element.click()
    for char in text:
        await page_or_frame.keyboard.type(char, delay=delay_ms + random.randint(-20, 30))
        if random.random() < 0.05:
            await asyncio.sleep(random.uniform(0.1, 0.3))


async def try_selectors(target, selectors, timeout=3000, description="요소"):
    """여러 셀렉터를 순서대로 시도하여 첫 번째 매칭되는 요소 반환"""
    per_timeout = min(timeout // max(len(selectors), 1), 2000)
    for selector in selectors:
        try:
            el = await target.wait_for_selector(selector, timeout=per_timeout)
            if el and await el.is_visible():
                logger.info(f"{description} 발견: {selector}")
                return el
        except Exception:
            continue
    logger.warning(f"{description}: 모든 셀렉터 시도 완료")
    return None


async def dismiss_blocking_popup(target, description=""):
    """SE ONE 에디터의 차단 팝업(se-popup-alert-confirm) 강제 제거."""
    dismissed = False
    try:
        result = await target.evaluate("""() => {
            const popup = document.querySelector('.se-popup-alert-confirm, [data-name*="se-popup-alert"]');
            if (!popup) return 'no_popup';
            const buttons = popup.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.trim() === '취소' || btn.textContent.trim() === '아니오') {
                    btn.click();
                    return 'clicked_cancel';
                }
            }
            if (buttons.length > 0) {
                buttons[0].click();
                return 'clicked_first';
            }
            popup.remove();
            return 'removed';
        }""")
        if result != 'no_popup':
            logger.info(f"차단 팝업 제거 ({description}): {result}")
            dismissed = True
            await random_delay(1, 2)
    except Exception as e:
        logger.debug(f"팝업 JS 제거 시도 실패: {e}")

    if not dismissed:
        try:
            await target.evaluate("""() => {
                const dims = document.querySelectorAll('.se-popup-dim');
                dims.forEach(d => {
                    const parent = d.closest('.se-popup');
                    if (parent) parent.remove();
                    else d.remove();
                });
            }""")
        except Exception:
            pass

    return dismissed


async def capture_debug(page, step_name):
    """디버그용 스크린샷 저장"""
    try:
        debug_dir = Path(__file__).resolve().parent.parent / "data" / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = debug_dir / f"{step_name}_{ts}.png"
        await page.screenshot(path=str(path))
        logger.info(f"디버그 스크린샷: {path}")
    except Exception as e:
        logger.warning(f"스크린샷 저장 실패: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 쿠키 / 로그인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _cookie_path(account_id: int) -> Path:
    return COOKIE_DIR / f"account_{account_id}.json"


async def save_cookies(page, account_id: int):
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


async def check_login_status(page, check_url="https://blog.naver.com") -> bool:
    """로그인 상태 확인 (check_url로 이동 후 로그인 버튼 유무 판단)"""
    try:
        await page.goto(check_url, wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(3)
        current_url = page.url
        if "nidlogin" in current_url:
            logger.info("로그인 상태 확인: 로그인 페이지로 리다이렉트됨")
            return False
        login_btn = await page.query_selector('a.btn_login, a[href*="nidlogin"], .link_login')
        is_logged_in = login_btn is None
        logger.info(f"로그인 상태 확인: {'로그인됨' if is_logged_in else '미로그인'} (URL: {current_url[:60]})")
        return is_logged_in
    except Exception as e:
        logger.warning(f"로그인 상태 확인 오류: {e}")
        return False


async def login_with_credentials(page, naver_id: str, naver_password: str) -> bool:
    """ID/PW로 네이버 로그인"""
    try:
        await page.goto("https://nid.naver.com/nidlogin.login", wait_until="domcontentloaded", timeout=15000)
        await random_delay(1, 2)

        await page.click("#id")
        await random_delay(0.3, 0.5)
        await page.evaluate(f'document.querySelector("#id").value = "{naver_id}"')
        await page.dispatch_event("#id", "input")
        await random_delay(0.5, 1)

        await page.click("#pw")
        await random_delay(0.3, 0.5)
        await page.evaluate(f'document.querySelector("#pw").value = "{naver_password}"')
        await page.dispatch_event("#pw", "input")
        await random_delay(0.5, 1)

        await page.click("#log\\.login, button.btn_login, button[type='submit']")
        await random_delay(3, 5)

        captcha = await page.query_selector("#captcha, .captcha_wrap")
        if captcha:
            logger.error("CAPTCHA 발생! 수동 개입 필요")
            return False

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
    cookie_loaded = await load_cookies(page.context, account_id)
    if cookie_loaded:
        is_logged_in = await check_login_status(page)
        if is_logged_in:
            logger.info(f"쿠키 로그인 성공: account_id={account_id}")
            return True
        logger.info("쿠키 만료, ID/PW 로그인 시도")

    for attempt in range(3):
        success = await login_with_credentials(page, naver_id, naver_password)
        if success:
            await save_cookies(page, account_id)
            return True
        logger.warning(f"로그인 재시도 {attempt + 2}/3")
        await random_delay(3, 5)

    return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 스텔스 브라우저
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def create_stealth_context(playwright_instance):
    """네이버 봇 감지를 우회하기 위한 스텔스 브라우저 컨텍스트 생성"""
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1920,1080",
    ]

    browser = None
    for channel in ["chrome", "msedge", None]:
        try:
            if channel:
                browser = await playwright_instance.chromium.launch(
                    channel=channel, headless=True, args=launch_args,
                )
                logger.info(f"브라우저 시작: channel={channel}")
            else:
                browser = await playwright_instance.chromium.launch(
                    headless=True, args=launch_args,
                )
                logger.info("브라우저 시작: 기본 Chromium")
            break
        except Exception as e:
            logger.warning(f"브라우저 시작 실패 (channel={channel}): {e}")
            continue

    if not browser:
        raise RuntimeError("사용 가능한 브라우저가 없습니다. Chrome 또는 Edge를 설치하세요.")

    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport={"width": 1920, "height": 1080},
        locale="ko-KR",
        timezone_id="Asia/Seoul",
    )
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
        window.chrome = { runtime: {} };
    """)
    return browser, context


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SE ONE 에디터 공통 조작
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def se_detect_iframe(page):
    """SE ONE 에디터 iframe 감지 및 전환. 에디터 프레임을 반환."""
    editor = page
    for frame_id in ["mainFrame", "se_editFrame", "editor_frame"]:
        try:
            frame_el = await page.wait_for_selector(
                f"iframe#{frame_id}, iframe[name='{frame_id}']",
                timeout=3000,
            )
            if frame_el:
                frame = await frame_el.content_frame()
                if frame:
                    editor = frame
                    logger.info(f"iframe 전환: {frame_id}")
                    await random_delay(1, 2)
                    break
        except Exception:
            continue
    return editor


async def se_dismiss_popups(page, editor):
    """에디터 진입 시 각종 팝업 처리 (작성 중 글, 도움말 등)"""
    # 작성 중인 글 팝업
    await dismiss_blocking_popup(editor, "에디터 진입 직후")

    # 도움말/공지 팝업 닫기
    try:
        close_btn = await try_selectors(editor, [
            '.se-popup-button-close',
            'button[aria-label="닫기"]',
            '.btn_close',
            'button:has-text("닫기")',
        ], timeout=2000, description="도움말 팝업")
        if close_btn:
            await close_btn.click()
            await random_delay(0.5, 1)
    except Exception:
        pass

    # 도움말 닫기 후 차단 팝업 재확인
    await dismiss_blocking_popup(editor, "도움말 닫기 후")


async def se_wait_editor(page, editor):
    """SE ONE 에디터 로딩 대기. 로딩된 요소 또는 None 반환."""
    editor_loaded = await try_selectors(editor, [
        '.se-component',
        '.se-documentTitle',
        '[contenteditable="true"]',
        'article',
        '.editor_area',
        '.se-section',
        '.se-module-text',
        '#content-area',
    ], timeout=20000, description="에디터")

    # 에디터를 못 찾으면 모든 iframe에서도 시도
    if not editor_loaded:
        logger.info("현재 컨텍스트에서 에디터 미발견 → 모든 iframe 탐색")
        for frame in page.frames:
            if frame == page.main_frame:
                continue
            try:
                el = await frame.wait_for_selector(
                    '.se-component, .se-documentTitle, [contenteditable="true"]',
                    timeout=5000,
                )
                if el:
                    logger.info(f"iframe에서 에디터 발견: {frame.url[:80]}")
                    return el, frame
            except Exception:
                continue

    return editor_loaded, editor


async def se_input_title(page, editor, title: str) -> bool:
    """SE ONE 에디터에 제목 입력. 성공 여부 반환."""
    title_entered = False
    try:
        title_el = await try_selectors(editor, [
            '.se-documentTitle .se-text-paragraph',
            '.se-documentTitle [contenteditable="true"]',
            '.se-section-title .se-text-paragraph',
            '[data-placeholder="제목"]',
            '.se-component:first-child [contenteditable="true"]',
            '.se-title-text',
            '.se-ff-nanumgothic.se-fs32',
            '[contenteditable="true"][class*="title"]',
        ], timeout=10000, description="제목 영역")

        if title_el:
            await title_el.click()
            await random_delay(0.3, 0.5)
            for char in title:
                await page.keyboard.type(char, delay=50 + random.randint(-20, 30))
            title_entered = True
            await random_delay(1, 2)
    except Exception as e:
        logger.warning(f"제목 셀렉터 실패: {e}")

    if not title_entered:
        try:
            logger.info("제목 폴백: 첫 번째 contenteditable 클릭 시도")
            first_editable = await editor.wait_for_selector(
                '[contenteditable="true"]', timeout=5000
            )
            if first_editable:
                await first_editable.click()
                await random_delay(0.3, 0.5)
            await page.keyboard.type(title, delay=50)
            title_entered = True
            await random_delay(1, 2)
        except Exception as e:
            logger.error(f"제목 입력 실패: {e}")

    return title_entered


async def se_insert_image(page, editor, image_path: str):
    """SE ONE 에디터에 대표이미지 삽입"""
    if not image_path:
        return

    try:
        img_btn = await try_selectors(editor, [
            'button[data-name="image"]',
            '.se-toolbar button[aria-label*="사진"]',
            '.se-toolbar button[aria-label*="이미지"]',
            'button.se-toolbar-button-image',
            '.se-toolbar-item-image button',
            'button.se-image-toolbar-button',
            'button[class*="image"]:not([class*="emoji"])',
        ], timeout=5000, description="이미지 버튼")

        if img_btn:
            await img_btn.click()
            await random_delay(1, 2)

            file_input = None
            for sel in ['input[type="file"][accept*="image"]', 'input[type="file"]']:
                try:
                    file_input = await editor.query_selector(sel)
                    if file_input:
                        logger.info(f"파일 입력 발견 (query_selector): {sel}")
                        break
                except Exception:
                    continue

            if not file_input:
                for sel in ['input[type="file"][accept*="image"]', 'input[type="file"]']:
                    try:
                        file_input = await page.query_selector(sel)
                        if file_input:
                            logger.info(f"파일 입력 발견 (page): {sel}")
                            break
                    except Exception:
                        continue

            if file_input:
                await file_input.set_input_files(image_path)
                await random_delay(3, 5)

                try:
                    confirm = await try_selectors(editor, [
                        'button:has-text("삽입")',
                        'button:has-text("확인")',
                        'button:has-text("등록")',
                        'button.se-popup-button-confirm',
                    ], timeout=10000, description="이미지 확인 버튼")
                    if confirm:
                        await confirm.click()
                        await random_delay(2, 3)
                except Exception:
                    pass

                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
                await random_delay(1, 2)
            else:
                logger.warning("파일 입력 요소 미발견 (숨김 포함)")

            logger.info("대표이미지 삽입 완료")
    except Exception as e:
        logger.warning(f"대표이미지 삽입 실패 (계속 진행): {e}")


async def _se_set_font_size(page, editor, size: int) -> bool:
    """SE ONE 툴바에서 폰트 크기 변경. 성공 여부 반환."""
    try:
        # 1. 툴바 폰트 크기 버튼 클릭
        font_btn = await try_selectors(editor, [
            'button[data-name="fontSize"]',
            '.se-toolbar-item-fontSize button',
            '.se-toolbar button[aria-label*="글자 크기"]',
            '.se-toolbar button[aria-label*="크기"]',
            '.se-toolbar button[aria-label*="font size"]',
        ], timeout=3000, description="폰트 크기 버튼")

        if not font_btn:
            # JS 폴백: 툴바에서 현재 폰트 크기가 표시된 버튼 찾기
            font_btn_handle = await editor.evaluate_handle('''() => {
                const btns = document.querySelectorAll('.se-toolbar button');
                for (const btn of btns) {
                    const text = (btn.textContent || "").trim();
                    if (/^\\d{1,2}$/.test(text) && parseInt(text) >= 10 && parseInt(text) <= 40) {
                        return btn;
                    }
                }
                return null;
            }''')
            if font_btn_handle:
                font_btn = font_btn_handle.as_element()

        if not font_btn:
            logger.warning("폰트 크기 버튼 미발견")
            return False

        await font_btn.click()
        await random_delay(0.3, 0.5)

        # 2. 드롭다운에서 크기 선택
        size_str = str(size)
        size_item = await try_selectors(editor, [
            f'[data-value="{size_str}"]',
            f'.se-popup-font-size li[data-value="{size_str}"]',
            f'button[data-value="{size_str}"]',
            f'li:has-text("{size_str}")',
        ], timeout=3000, description=f"폰트 크기 {size}")

        if not size_item:
            # JS 폴백: 드롭다운/팝업 내에서 크기 값 매칭
            js_clicked = await editor.evaluate(f'''() => {{
                const popups = document.querySelectorAll(
                    '.se-popup, .se-popup-font-size, [class*="font_size"], [class*="fontSize"]'
                );
                for (const popup of popups) {{
                    const items = popup.querySelectorAll('li, button, [data-value]');
                    for (const item of items) {{
                        const val = item.dataset?.value || item.textContent?.trim();
                        if (val === '{size_str}') {{
                            item.click();
                            return true;
                        }}
                    }}
                }}
                return false;
            }}''')
            if js_clicked:
                logger.info(f"폰트 크기 {size} JS 폴백 성공")
                await random_delay(0.2, 0.3)
                return True

            # 드롭다운 닫기 (크기를 못 찾은 경우)
            await page.keyboard.press("Escape")
            logger.warning(f"폰트 크기 {size} 항목 미발견")
            return False

        await size_item.click()
        await random_delay(0.2, 0.3)
        logger.info(f"폰트 크기 변경: {size}")
        return True

    except Exception as e:
        logger.warning(f"폰트 크기 변경 실패: {e}")
        return False


async def se_input_body(page, editor, content: str,
                        heading_size: int = 24, body_size: int = 15):
    """SE ONE 에디터에 본문 입력 (가운데 정렬, 줄 단위).
    소제목(# / ##)은 볼드 + 큰 폰트로 강조."""
    try:
        body_el = await try_selectors(editor, [
            '.se-component.se-text .se-text-paragraph',
            '.se-section-text .se-text-paragraph',
            '.se-component-content [contenteditable="true"]',
            '.se-text-paragraph',
        ], timeout=5000, description="본문 영역")
        if body_el:
            await body_el.click()
            await random_delay(0.5, 1)
    except Exception:
        pass

    # 가운데 정렬
    await page.keyboard.press("Control+e")
    await random_delay(0.3, 0.5)

    lines = content.split("\n")
    base_delay = random.randint(25, 45)
    for i, line in enumerate(lines):
        if line.strip():
            clean_line = line.strip()
            line_delay = base_delay + random.randint(-8, 12)
            is_heading = False

            if clean_line.startswith("## "):
                clean_line = clean_line[3:]
                is_heading = True
            elif clean_line.startswith("# "):
                clean_line = clean_line[2:]
                is_heading = True

            if is_heading:
                # 소제목: 폰트 크기 확대 + 볼드
                await _se_set_font_size(page, editor, heading_size)
                await page.keyboard.press("Control+b")
                await random_delay(0.2, 0.3)

                await page.keyboard.type(clean_line, delay=line_delay)

                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")

                # 서식 복원: 볼드 해제 + 폰트 크기 원복
                await page.keyboard.press("Control+b")
                await _se_set_font_size(page, editor, body_size)
                await random_delay(0.2, 0.3)

            elif clean_line.startswith("- "):
                clean_line = clean_line[2:]
                await page.keyboard.type("• " + clean_line, delay=line_delay)
                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
            else:
                clean_line = clean_line.replace("**", "")
                await page.keyboard.type(clean_line, delay=line_delay)
                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
        else:
            await page.keyboard.press("Enter")

        r = random.random()
        if r < 0.03:
            await asyncio.sleep(random.uniform(3.0, 6.0))
        elif r < 0.10:
            await asyncio.sleep(random.uniform(0.8, 2.0))
        elif r < 0.20:
            await asyncio.sleep(random.uniform(0.2, 0.5))


async def se_insert_footer_link(page, editor, footer_link: str, footer_link_text: str = ""):
    """SE ONE 에디터에 하단 링크 삽입 (Ctrl+K 링크 다이얼로그)"""
    if not footer_link:
        return

    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    link_display = footer_link_text if footer_link_text else footer_link
    await page.keyboard.type(link_display, delay=30 + random.randint(-10, 15))
    await random_delay(0.3, 0.5)

    for _ in range(len(link_display)):
        await page.keyboard.press("Shift+ArrowLeft")
    await random_delay(0.3, 0.5)

    await page.keyboard.press("Control+k")
    await random_delay(1, 2)

    try:
        link_input = await try_selectors(editor, [
            'input[placeholder*="URL"]',
            'input[placeholder*="url"]',
            'input[placeholder*="링크"]',
            '.se-link-input input',
            '.se-popup-link input',
            'input[type="url"]',
            'input[type="text"]',
        ], timeout=5000, description="링크 입력")

        if not link_input:
            link_input = await editor.evaluate_handle('''() => {
                const popup = document.querySelector('.se-popup-link, .se-popup, [class*="link_layer"]');
                if (popup) {
                    const inp = popup.querySelector('input');
                    if (inp) return inp;
                }
                return null;
            }''')
            if link_input:
                link_input = link_input.as_element()

        if link_input:
            await link_input.click()
            await link_input.fill("")
            await random_delay(0.2, 0.3)
            await link_input.type(footer_link, delay=20)
            await random_delay(0.5, 1)

            # 돋보기(검색) 버튼
            search_btn = await try_selectors(editor, [
                '.se-popup-link button[class*="search"]',
                '.se-popup-link button[class*="query"]',
                '.se-popup button[class*="search"]',
                'button.se-link-preview-btn',
            ], timeout=3000, description="링크 돋보기 버튼")

            if not search_btn:
                search_btn_handle = await editor.evaluate_handle('''() => {
                    const popup = document.querySelector('.se-popup-link, .se-popup, [class*="link_layer"]');
                    if (popup) {
                        const btns = popup.querySelectorAll('button');
                        for (const btn of btns) {
                            if (btn.querySelector('svg, [class*="ico"], [class*="icon"], [class*="search"]')) {
                                return btn;
                            }
                        }
                        if (btns.length > 0) return btns[0];
                    }
                    return null;
                }''')
                if search_btn_handle:
                    search_btn = search_btn_handle.as_element()

            if search_btn:
                await search_btn.click()
                logger.info("링크 돋보기 버튼 클릭")
                await random_delay(3, 5)
                try:
                    await editor.wait_for_selector(
                        '.se-popup-link [class*="preview"], .se-popup [class*="preview"], '
                        '.se-popup-link [class*="og"], .se-popup [class*="card"], '
                        '.se-popup-link img',
                        timeout=10000,
                    )
                    logger.info("링크 미리보기 로드 완료")
                except Exception:
                    logger.warning("링크 미리보기 로드 타임아웃 (계속 진행)")
                await random_delay(1, 2)
            else:
                logger.warning("돋보기 버튼 미발견, Enter로 대체")
                await page.keyboard.press("Enter")
                await random_delay(2, 3)

            # 확인 버튼
            confirm_btn = await try_selectors(editor, [
                '.se-popup-link button:has-text("확인")',
                '.se-popup button:has-text("확인")',
                'button.se-popup-button-confirm',
                'button:has-text("확인")',
            ], timeout=5000, description="링크 확인 버튼")

            if not confirm_btn:
                confirm_handle = await editor.evaluate_handle('''() => {
                    const popup = document.querySelector('.se-popup-link, .se-popup, [class*="link_layer"]');
                    if (popup) {
                        const btns = popup.querySelectorAll('button');
                        for (const btn of btns) {
                            const text = (btn.textContent || "").trim();
                            if (text === '확인' || text.includes('확인')) {
                                return btn;
                            }
                        }
                    }
                    return null;
                }''')
                if confirm_handle:
                    confirm_btn = confirm_handle.as_element()

            if confirm_btn:
                await confirm_btn.click()
                await random_delay(1, 2)
                logger.info(f"하단 링크 삽입 완료: {footer_link}")
            else:
                logger.warning("링크 확인 버튼 미발견, Enter로 대체")
                await page.keyboard.press("Enter")
                await random_delay(1, 2)
        else:
            logger.warning("링크 입력 필드 미발견")
    except Exception as e:
        logger.warning(f"링크 다이얼로그 실패, 텍스트로 대체: {e}")
        await page.keyboard.press("Escape")
        await random_delay(0.3, 0.5)
        await page.keyboard.press("End")
        await page.keyboard.type(f" ({footer_link})", delay=20)


async def se_input_tags(page, editor, tags: list):
    """SE ONE 에디터에 태그 입력"""
    if not tags:
        return

    tag_entered = False
    try:
        tag_input = await try_selectors(editor, [
            'input[placeholder*="태그"]',
            '.se-tag-input input',
            '.tag_inner input',
            'input[class*="tag"]',
            '.tag_area input',
            '.se-tag input',
        ], timeout=3000, description="태그 입력(에디터)")

        if not tag_input and editor != page:
            tag_input = await try_selectors(page, [
                'input[placeholder*="태그"]',
                '.se-tag-input input',
                '.tag_inner input',
                'input[class*="tag"]',
                '.tag_area input',
            ], timeout=3000, description="태그 입력(메인)")

        if tag_input:
            await tag_input.click()
            await random_delay(0.3, 0.5)
            for tag in tags[:10]:
                await page.keyboard.type(tag, delay=40)
                await page.keyboard.press("Enter")
                await random_delay(0.3, 0.5)
            tag_entered = True
            logger.info("태그 입력 성공 (셀렉터)")
        else:
            logger.info("태그 입력 JS 폴백 시도")
            for target_name, target in ([("editor", editor)] + ([("page", page)] if editor != page else [])):
                try:
                    found = await target.evaluate("""() => {
                        const inputs = document.querySelectorAll('input');
                        for (const inp of inputs) {
                            const ph = (inp.placeholder || '').toLowerCase();
                            const cls = (inp.className || '').toLowerCase();
                            if (ph.includes('태그') || ph.includes('tag') ||
                                cls.includes('tag')) {
                                inp.focus();
                                inp.click();
                                return true;
                            }
                        }
                        const tagAreas = document.querySelectorAll(
                            '[class*="tag"] [contenteditable="true"]'
                        );
                        for (const area of tagAreas) {
                            area.focus();
                            area.click();
                            return true;
                        }
                        return false;
                    }""")
                    if found:
                        for tag in tags[:10]:
                            await page.keyboard.type(tag, delay=40)
                            await page.keyboard.press("Enter")
                            await random_delay(0.3, 0.5)
                        tag_entered = True
                        logger.info(f"태그 입력 JS 폴백 성공 ({target_name})")
                        break
                except Exception:
                    continue
        if not tag_entered:
            logger.warning("태그 입력 영역 미발견 (모든 방법 실패)")
    except Exception as e:
        logger.warning(f"태그 입력 실패: {e}")


async def se_click_publish(page, editor) -> bool:
    """SE ONE 에디터 발행 버튼 클릭 + 확인 다이얼로그 처리. 성공 여부 반환."""
    await random_delay(1, 2)
    publish_clicked = False

    try:
        publish_btn = None
        if editor != page:
            publish_btn = await try_selectors(editor, [
                'button:has-text("발행")',
                'button:has-text("공개발행")',
                'button[class*="publish"]',
                '.publish_btn',
                'button:has-text("등록")',
            ], timeout=5000, description="발행 버튼(에디터)")

        if not publish_btn:
            publish_btn = await try_selectors(page, [
                'button:has-text("발행")',
                'button:has-text("공개발행")',
                'button[class*="publish"]',
                'button[class*="btn_publish"]',
                '.publish_btn',
                'button:has-text("등록")',
            ], timeout=5000, description="발행 버튼(메인)")

        if publish_btn:
            await publish_btn.click()
            publish_clicked = True
        else:
            logger.info("발행 버튼 JS 폴백 시도")
            for target in ([editor, page] if editor != page else [page]):
                try:
                    js_clicked = await target.evaluate('''() => {
                        const buttons = document.querySelectorAll('button, a[role="button"]');
                        for (const btn of buttons) {
                            const text = (btn.textContent || "").trim();
                            if (text === '발행' || text === '공개발행' || text === '등록') {
                                btn.click();
                                return true;
                            }
                        }
                        return false;
                    }''')
                    if js_clicked:
                        publish_clicked = True
                        logger.info("발행 버튼 JS 클릭 성공")
                        break
                except Exception:
                    continue

        if not publish_clicked:
            await capture_debug(page, "publish_btn_not_found")
            return False

        await random_delay(2, 3)

        # 발행 확인 다이얼로그
        confirm_clicked = False

        if editor != page:
            confirm_btn = await try_selectors(editor, [
                '.se-popup-publish-btn',
                '.se-publish-popup button:has-text("발행")',
                'button.se-popup-button-confirm',
                'button:has-text("공개 발행")',
                'button:has-text("발행하기")',
            ], timeout=3000, description="발행 확인(에디터)")
            if confirm_btn:
                await confirm_btn.click()
                confirm_clicked = True
                logger.info("발행 확인 클릭 (에디터 셀렉터)")

        if not confirm_clicked:
            confirm_btn = await try_selectors(page, [
                'button:has-text("발행")',
                'button:has-text("공개 발행")',
                'button:has-text("확인")',
                '.confirm_btn',
            ], timeout=3000, description="발행 확인(메인)")
            if confirm_btn:
                await confirm_btn.click()
                confirm_clicked = True
                logger.info("발행 확인 클릭 (메인 셀렉터)")

        if not confirm_clicked:
            logger.info("발행 확인 JS 폴백 시도")
            for target in ([editor, page] if editor != page else [page]):
                try:
                    js_result = await target.evaluate('''() => {
                        const popups = document.querySelectorAll(
                            '.se-popup-publish, .se-popup, [class*="publish_layer"], [class*="layer_publish"]'
                        );
                        for (const popup of popups) {
                            const btns = popup.querySelectorAll('button');
                            for (const btn of btns) {
                                const text = (btn.textContent || "").trim();
                                if (text === '발행' || text === '발행하기' || text === '공개 발행') {
                                    btn.click();
                                    return 'popup_btn';
                                }
                            }
                        }
                        const allBtns = document.querySelectorAll('button');
                        for (const btn of allBtns) {
                            const text = (btn.textContent || "").trim();
                            if (text === '발행' || text === '발행하기') {
                                btn.click();
                                return 'global_btn';
                            }
                        }
                        return null;
                    }''')
                    if js_result:
                        confirm_clicked = True
                        logger.info(f"발행 확인 JS 클릭 성공: {js_result}")
                        break
                except Exception:
                    continue

        if confirm_clicked:
            await random_delay(3, 5)
        else:
            logger.warning("발행 확인 버튼 미발견 (자동 발행 가능성)")
            await random_delay(5, 8)

        return True

    except Exception as e:
        logger.error(f"발행 버튼 클릭 실패: {e}")
        await capture_debug(page, "publish_error")
        return False
