"""
Playwright 기반 네이버 블로그 자동 발행 엔진
- 쿠키 우선 로그인, 실패 시 ID/PW 로그인
- 타이핑 시뮬레이션
- iframe 처리
- 카테고리 선택
"""

import os
import sys
import json
import asyncio
import random
import logging
from pathlib import Path
from datetime import datetime


def _run_in_proactor_loop(coro_func, *args, **kwargs):
    """Windows에서 ProactorEventLoop을 사용하여 코루틴 실행.
    Playwright의 subprocess 생성이 SelectorEventLoop에서 실패하는 문제 해결."""
    loop = asyncio.ProactorEventLoop()
    try:
        return loop.run_until_complete(coro_func(*args, **kwargs))
    finally:
        loop.close()

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


async def _try_selectors(target, selectors, timeout=3000, description="요소"):
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


async def _dismiss_blocking_popup(target, description=""):
    """SE ONE 에디터의 차단 팝업(se-popup-alert-confirm) 강제 제거.
    '작성 중인 글이 있습니다' 등의 팝업이 오버레이로 클릭을 차단하는 문제 해결.
    """
    dismissed = False
    # 방법 1: JavaScript로 팝업 내 취소 버튼 클릭 (가장 확실)
    try:
        result = await target.evaluate("""() => {
            // se-popup-alert-confirm 팝업 찾기
            const popup = document.querySelector('.se-popup-alert-confirm, [data-name*="se-popup-alert"]');
            if (!popup) return 'no_popup';
            // 취소 버튼 찾기 (첫 번째 버튼이 취소)
            const buttons = popup.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.trim() === '취소' || btn.textContent.trim() === '아니오') {
                    btn.click();
                    return 'clicked_cancel';
                }
            }
            // 취소 버튼을 못 찾으면 첫 번째 버튼 클릭
            if (buttons.length > 0) {
                buttons[0].click();
                return 'clicked_first';
            }
            // 버튼 없으면 팝업 자체를 제거
            popup.remove();
            return 'removed';
        }""")
        if result != 'no_popup':
            logger.info(f"차단 팝업 제거 ({description}): {result}")
            dismissed = True
            await _random_delay(1, 2)
    except Exception as e:
        logger.debug(f"팝업 JS 제거 시도 실패: {e}")

    # 방법 2: dim 오버레이만 남아있을 경우 강제 제거
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


async def _capture_debug(page, step_name):
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
        await asyncio.sleep(3)
        current_url = page.url
        # 로그인 페이지로 리다이렉트되면 미로그인
        if "nidlogin" in current_url:
            logger.info("로그인 상태 확인: 로그인 페이지로 리다이렉트됨")
            return False
        # 로그인 상태면 프로필 영역이 있음
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
    image_path: str = "",
    footer_link: str = "",
    footer_link_text: str = "",
) -> dict:
    """
    네이버 블로그에 글을 발행합니다.
    SmartEditor ONE 기준 셀렉터를 사용하며, 다중 폴백을 지원합니다.
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
        #    login() 이후 page는 blog.naver.com에 있음
        #    방법 A: blog.naver.com 메인에서 "글쓰기" 버튼 클릭
        #    방법 B: 내 블로그(blog.naver.com/{id})에서 "글쓰기" 버튼 클릭
        #    방법 C: 직접 URL 이동 (폴백)
        editor_page_reached = False
        original_page = page

        # --- 방법 A: blog.naver.com 메인에서 글쓰기 버튼 ---
        logger.info(f"현재 페이지 URL: {page.url}")
        if "blog.naver.com" not in page.url:
            await page.goto("https://blog.naver.com", wait_until="domcontentloaded", timeout=20000)
            await _random_delay(2, 3)
            logger.info(f"blog.naver.com 이동 완료: {page.url}")

        # 글쓰기 버튼/링크 찾기 (네이버 블로그 메인 및 내 블로그 페이지)
        write_selectors = [
            'a[href*="/postwrite"]',
            'a[href*="PostWriteForm"]',
            'a:has-text("글쓰기")',
            'button:has-text("글쓰기")',
            '.btn_write',
            'a.link_write',
            '#writePostBtn',
            '.blog_menu a[href*="write"]',
        ]

        write_btn = await _try_selectors(page, write_selectors, timeout=5000, description="글쓰기 버튼(메인)")
        if not write_btn:
            # 방법 B: 내 블로그 페이지로 이동 후 시도
            blog_url = f"https://blog.naver.com/{naver_id}"
            logger.info(f"메인에서 글쓰기 버튼 없음 → 내 블로그 이동: {blog_url}")
            await page.goto(blog_url, wait_until="domcontentloaded", timeout=20000)
            await _random_delay(2, 3)

            page_content = await page.content()
            if "페이지 주소를 확인" in page_content:
                logger.warning(f"내 블로그 404: {blog_url}")
                await _capture_debug(page, "my_blog_404")
            else:
                write_btn = await _try_selectors(page, write_selectors, timeout=5000, description="글쓰기 버튼(내블로그)")

        if write_btn:
            logger.info("글쓰기 버튼 발견 → 클릭")
            try:
                # 새 탭/팝업으로 열릴 수 있음
                async with page.context.expect_page(timeout=10000) as new_page_info:
                    await write_btn.click()
                new_page = await new_page_info.value
                await new_page.wait_for_load_state("domcontentloaded")
                page = new_page
                logger.info(f"새 탭에서 글쓰기 페이지 열림: {page.url}")
            except Exception:
                # 같은 탭에서 로드됨
                await page.wait_for_load_state("domcontentloaded")
                logger.info(f"같은 탭에서 글쓰기 페이지 로드: {page.url}")

            await _random_delay(3, 5)
            page_content = await page.content()
            if "페이지 주소를 확인" not in page_content:
                editor_page_reached = True
                logger.info(f"글쓰기 페이지 도달 (버튼 클릭): {page.url}")

        # --- 방법 C: 직접 URL 이동 (폴백) ---
        if not editor_page_reached:
            write_urls = [
                f"https://blog.naver.com/{naver_id}/postwrite",
                f"https://blog.naver.com/PostWriteForm.naver?blogId={naver_id}",
                "https://blog.naver.com/PostWriteForm.naver",
            ]
            for write_url in write_urls:
                logger.info(f"직접 URL 이동 시도: {write_url}")
                try:
                    await page.goto(write_url, wait_until="domcontentloaded", timeout=20000)
                    await _random_delay(3, 5)

                    page_content = await page.content()
                    if "페이지 주소를 확인" in page_content or "페이지를 찾을 수 없" in page_content:
                        logger.warning(f"에러 페이지 감지: {write_url}")
                        continue

                    editor_page_reached = True
                    logger.info(f"글쓰기 페이지 도달 (URL): {page.url}")
                    break
                except Exception as e:
                    logger.warning(f"URL 이동 실패: {write_url} - {e}")
                    continue

        if not editor_page_reached:
            await _capture_debug(page, "write_page_unreachable")
            result["error"] = (
                f"글쓰기 페이지 접근 실패. "
                f"① 블로그가 개설되어 있는지 확인하세요. "
                f"② 브라우저에서 https://blog.naver.com/{naver_id} 접속이 되는지 확인하세요. "
                f"(blogId={naver_id})"
            )
            return result

        # 2-1. iframe 감지 및 전환
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
                        await _random_delay(1, 2)
                        break
            except Exception:
                continue

        # 3. "작성 중인 글이 있습니다" 팝업 처리 → 취소 클릭
        await _dismiss_blocking_popup(editor, "에디터 진입 직후")

        # 4. 도움말/공지 팝업 닫기
        try:
            close_btn = await _try_selectors(editor, [
                '.se-popup-button-close',
                'button[aria-label="닫기"]',
                '.btn_close',
                'button:has-text("닫기")',
            ], timeout=2000, description="도움말 팝업")
            if close_btn:
                await close_btn.click()
                await _random_delay(0.5, 1)
        except Exception:
            pass

        # 4-1. 도움말 팝업 닫기 후 차단 팝업이 나타날 수 있음 → 재확인
        await _dismiss_blocking_popup(editor, "도움말 닫기 후")

        # 5. 에디터 로딩 대기 (SE ONE 구조 확인)
        editor_loaded = await _try_selectors(editor, [
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
                        editor = frame
                        editor_loaded = el
                        logger.info(f"iframe에서 에디터 발견: {frame.url[:80]}")
                        break
                except Exception:
                    continue

        if not editor_loaded:
            await _capture_debug(page, "editor_not_loaded")
            current_url = page.url
            page_title = await page.title()
            # 페이지의 HTML 일부도 로깅 (디버깅용)
            try:
                body_text = await page.evaluate("document.body?.innerText?.substring(0, 500) || ''")
                logger.error(f"에디터 미발견 - URL: {current_url}, 제목: {page_title}, 본문: {body_text[:200]}")
            except Exception:
                pass
            result["error"] = f"에디터 로딩 실패 (URL: {current_url}, 제목: {page_title})"
            return result

        await _random_delay(1, 2)

        # 5-1. 에디터 로딩 후 차단 팝업 최종 확인 (가장 중요!)
        #      에디터가 로드된 뒤에 "작성 중인 글이 있습니다" 팝업이 뜨는 경우가 많음
        await _dismiss_blocking_popup(editor, "에디터 로딩 후")

        # 6. 카테고리 선택
        if category_name:
            try:
                cat_btn = await _try_selectors(editor, [
                    'button:has-text("카테고리")',
                    '.blog_category_btn',
                    '.publish_category_btn',
                    'button[class*="category"]',
                    '[class*="category"] button',
                ], timeout=3000, description="카테고리 버튼")
                if cat_btn:
                    await cat_btn.click()
                    await _random_delay(0.5, 1)
                    cat_item = await _try_selectors(editor, [
                        f'li:has-text("{category_name}")',
                        f'span:has-text("{category_name}")',
                        f'a:has-text("{category_name}")',
                    ], timeout=3000, description=f"카테고리 항목({category_name})")
                    if cat_item:
                        await cat_item.click()
                        await _random_delay(0.5, 1)
            except Exception as e:
                logger.warning(f"카테고리 선택 실패: {e}")

        # 7. 제목 입력 (SE ONE: se-documentTitle 컴포넌트)
        title_entered = False
        try:
            title_el = await _try_selectors(editor, [
                # SE ONE 제목 셀렉터
                '.se-documentTitle .se-text-paragraph',
                '.se-documentTitle [contenteditable="true"]',
                '.se-section-title .se-text-paragraph',
                '[data-placeholder="제목"]',
                # 제네릭 셀렉터
                '.se-component:first-child [contenteditable="true"]',
                '.se-title-text',
                # 구버전 폴백
                '.se-ff-nanumgothic.se-fs32',
                '[contenteditable="true"][class*="title"]',
            ], timeout=10000, description="제목 영역")

            if title_el:
                await title_el.click()
                await _random_delay(0.3, 0.5)
                for char in title:
                    await page.keyboard.type(char, delay=50 + random.randint(-20, 30))
                title_entered = True
                await _random_delay(1, 2)
        except Exception as e:
            logger.warning(f"제목 셀렉터 실패: {e}")

        if not title_entered:
            # 폴백: 첫 번째 contenteditable 요소 클릭 후 타이핑
            try:
                logger.info("제목 폴백: 첫 번째 contenteditable 클릭 시도")
                first_editable = await editor.wait_for_selector(
                    '[contenteditable="true"]', timeout=5000
                )
                if first_editable:
                    await first_editable.click()
                    await _random_delay(0.3, 0.5)
                await page.keyboard.type(title, delay=50)
                title_entered = True
                await _random_delay(1, 2)
            except Exception as e:
                await _capture_debug(page, "title_failed")
                result["error"] = f"제목 입력 실패: {e}"
                return result

        # 8. 본문 영역으로 이동
        await page.keyboard.press("Tab")
        await _random_delay(1, 2)

        # 8-1. 대표이미지 삽입 (키워드 이미지)
        if image_path:
            try:
                img_btn = await _try_selectors(editor, [
                    # SE ONE 툴바 이미지 버튼
                    'button[data-name="image"]',
                    '.se-toolbar button[aria-label*="사진"]',
                    '.se-toolbar button[aria-label*="이미지"]',
                    'button.se-toolbar-button-image',
                    '.se-toolbar-item-image button',
                    # 구버전 폴백
                    'button.se-image-toolbar-button',
                    'button[class*="image"]:not([class*="emoji"])',
                ], timeout=5000, description="이미지 버튼")

                if img_btn:
                    await img_btn.click()
                    await _random_delay(1, 2)

                    # 파일 input에 이미지 설정
                    file_input = await _try_selectors(editor, [
                        'input[type="file"][accept*="image"]',
                        'input[type="file"]',
                    ], timeout=5000, description="파일 입력")
                    if file_input:
                        await file_input.set_input_files(image_path)
                        await _random_delay(3, 5)

                        # 업로드 완료 대기 및 확인 버튼
                        try:
                            confirm = await _try_selectors(editor, [
                                'button:has-text("삽입")',
                                'button:has-text("확인")',
                                'button:has-text("등록")',
                                'button.se-popup-button-confirm',
                            ], timeout=10000, description="이미지 확인 버튼")
                            if confirm:
                                await confirm.click()
                                await _random_delay(2, 3)
                        except Exception:
                            pass

                        await page.keyboard.press("Enter")
                        await page.keyboard.press("Enter")
                        await _random_delay(1, 2)

                    logger.info("대표이미지 삽입 완료")
            except Exception as e:
                logger.warning(f"대표이미지 삽입 실패 (계속 진행): {e}")

        # 9. 본문 입력 (줄 단위로 입력하여 자연스럽게)
        try:
            body_el = await _try_selectors(editor, [
                # SE ONE 본문 셀렉터
                '.se-component.se-text .se-text-paragraph',
                '.se-section-text .se-text-paragraph',
                '.se-component-content [contenteditable="true"]',
                '.se-text-paragraph',
            ], timeout=5000, description="본문 영역")
            if body_el:
                await body_el.click()
                await _random_delay(0.5, 1)
        except Exception:
            pass

        lines = content.split("\n")
        base_delay = random.randint(25, 45)
        for i, line in enumerate(lines):
            if line.strip():
                clean_line = line.strip()
                line_delay = base_delay + random.randint(-8, 12)
                if clean_line.startswith("## "):
                    clean_line = clean_line[3:]
                    await page.keyboard.type(clean_line, delay=line_delay)
                elif clean_line.startswith("# "):
                    clean_line = clean_line[2:]
                    await page.keyboard.type(clean_line, delay=line_delay)
                elif clean_line.startswith("- "):
                    clean_line = clean_line[2:]
                    await page.keyboard.type("• " + clean_line, delay=line_delay)
                else:
                    clean_line = clean_line.replace("**", "")
                    await page.keyboard.type(clean_line, delay=line_delay)

            await page.keyboard.press("Enter")

            r = random.random()
            if r < 0.03:
                await asyncio.sleep(random.uniform(3.0, 6.0))
            elif r < 0.10:
                await asyncio.sleep(random.uniform(0.8, 2.0))
            elif r < 0.20:
                await asyncio.sleep(random.uniform(0.2, 0.5))

        # 9-1. 하단 링크 삽입 (SE ONE 링크 다이얼로그)
        #   흐름: 본문에서 텍스트 입력 → 텍스트 선택 → Ctrl+K → 링크 다이얼로그
        #         → URL 입력 → 돋보기(검색) 버튼 클릭 → 미리보기 로드 대기 → 확인
        if footer_link:
            await page.keyboard.press("Enter")
            await page.keyboard.press("Enter")
            link_display = footer_link_text if footer_link_text else footer_link
            await page.keyboard.type(link_display, delay=30 + random.randint(-10, 15))
            await _random_delay(0.3, 0.5)
            # 텍스트 전체 선택
            for _ in range(len(link_display)):
                await page.keyboard.press("Shift+ArrowLeft")
            await _random_delay(0.3, 0.5)
            # 링크 다이얼로그 열기
            await page.keyboard.press("Control+k")
            await _random_delay(1, 2)
            try:
                # 링크 입력 필드 찾기
                link_input = await _try_selectors(editor, [
                    'input[placeholder*="URL"]',
                    'input[placeholder*="url"]',
                    'input[placeholder*="링크"]',
                    '.se-link-input input',
                    '.se-popup-link input',
                    'input[type="url"]',
                    'input[type="text"]',
                ], timeout=5000, description="링크 입력")

                if not link_input:
                    # JS 폴백: 링크 다이얼로그 내 input 직접 찾기
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
                    await _random_delay(0.2, 0.3)
                    await link_input.type(footer_link, delay=20)
                    await _random_delay(0.5, 1)

                    # 돋보기(검색) 버튼 클릭 → OG 미리보기 로드
                    search_btn = await _try_selectors(editor, [
                        '.se-popup-link button[class*="search"]',
                        '.se-popup-link button[class*="query"]',
                        '.se-popup button[class*="search"]',
                        'button.se-link-preview-btn',
                    ], timeout=3000, description="링크 돋보기 버튼")

                    if not search_btn:
                        # JS 폴백: input 옆의 버튼 찾기
                        search_btn_handle = await editor.evaluate_handle('''() => {
                            const popup = document.querySelector('.se-popup-link, .se-popup, [class*="link_layer"]');
                            if (popup) {
                                const btns = popup.querySelectorAll('button');
                                for (const btn of btns) {
                                    // 돋보기 아이콘 버튼 (input 바로 옆)
                                    if (btn.querySelector('svg, [class*="ico"], [class*="icon"], [class*="search"]')) {
                                        return btn;
                                    }
                                }
                                // 첫 번째 버튼이 돋보기일 가능성
                                if (btns.length > 0) return btns[0];
                            }
                            return null;
                        }''')
                        if search_btn_handle:
                            search_btn = search_btn_handle.as_element()

                    if search_btn:
                        await search_btn.click()
                        logger.info("링크 돋보기 버튼 클릭")
                        # 미리보기 로드 대기 (OG 카드가 나타날 때까지)
                        await _random_delay(3, 5)
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
                        await _random_delay(1, 2)
                    else:
                        logger.warning("돋보기 버튼 미발견, Enter로 대체")
                        await page.keyboard.press("Enter")
                        await _random_delay(2, 3)

                    # 확인 버튼 클릭
                    confirm_btn = await _try_selectors(editor, [
                        '.se-popup-link button:has-text("확인")',
                        '.se-popup button:has-text("확인")',
                        'button.se-popup-button-confirm',
                        'button:has-text("확인")',
                    ], timeout=5000, description="링크 확인 버튼")

                    if not confirm_btn:
                        # JS 폴백: 팝업 내 "확인" 텍스트 버튼
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
                        await _random_delay(1, 2)
                        logger.info(f"하단 링크 삽입 완료: {footer_link}")
                    else:
                        logger.warning("링크 확인 버튼 미발견, Enter로 대체")
                        await page.keyboard.press("Enter")
                        await _random_delay(1, 2)
                else:
                    logger.warning("링크 입력 필드 미발견")
            except Exception as e:
                logger.warning(f"링크 다이얼로그 실패, 텍스트로 대체: {e}")
                await page.keyboard.press("Escape")
                await _random_delay(0.3, 0.5)
                await page.keyboard.press("End")
                await page.keyboard.type(f" ({footer_link})", delay=20)

        await _random_delay(2, 3)

        # 10. 태그 입력
        if tags:
            try:
                tag_input = await _try_selectors(editor, [
                    'input[placeholder*="태그"]',
                    '.se-tag-input',
                    '.tag_inner input',
                    'input[class*="tag"]',
                    '.tag_area input',
                ], timeout=5000, description="태그 입력")
                if tag_input:
                    await tag_input.click()
                    for tag in tags[:10]:
                        await page.keyboard.type(tag, delay=40)
                        await page.keyboard.press("Enter")
                        await _random_delay(0.3, 0.5)
                else:
                    # JS 폴백: iframe 내 태그 입력 찾기
                    logger.info("태그 입력 JS 폴백 시도")
                    found = await editor.evaluate("""() => {
                        const inputs = document.querySelectorAll('input');
                        for (const inp of inputs) {
                            const ph = inp.placeholder || '';
                            if (ph.includes('태그') || ph.includes('tag')) {
                                inp.focus();
                                inp.click();
                                return true;
                            }
                        }
                        return false;
                    }""")
                    if found:
                        for tag in tags[:10]:
                            await page.keyboard.type(tag, delay=40)
                            await page.keyboard.press("Enter")
                            await _random_delay(0.3, 0.5)
                        logger.info("태그 입력 JS 폴백 성공")
            except Exception as e:
                logger.warning(f"태그 입력 실패: {e}")

        # 11. 발행 버튼 클릭
        await _random_delay(1, 2)
        publish_clicked = False
        pre_publish_url = page.url  # 발행 전 URL 저장
        try:
            # 발행 버튼: 에디터(iframe) → 메인 페이지 순서로 탐색
            publish_btn = None
            if editor != page:
                publish_btn = await _try_selectors(editor, [
                    'button:has-text("발행")',
                    'button:has-text("공개발행")',
                    'button[class*="publish"]',
                    '.publish_btn',
                    'button:has-text("등록")',
                ], timeout=5000, description="발행 버튼(에디터)")

            if not publish_btn:
                publish_btn = await _try_selectors(page, [
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
                # JS 폴백: iframe + page 모두에서 발행 버튼 찾기
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
                await _capture_debug(page, "publish_btn_not_found")
                result["error"] = "발행 버튼을 찾을 수 없습니다"
                return result

            await _random_delay(2, 3)

            # 11-1. 발행 확인 다이얼로그 (설정 패널 → 최종 발행)
            #       SE ONE: 발행 버튼 → 설정 패널 열림 → "발행" 확인 버튼
            #       에디터(iframe)과 page 모두 탐색
            confirm_clicked = False

            # iframe에서 먼저 시도
            if editor != page:
                confirm_btn = await _try_selectors(editor, [
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

            # page에서도 시도
            if not confirm_clicked:
                confirm_btn = await _try_selectors(page, [
                    'button:has-text("발행")',
                    'button:has-text("공개 발행")',
                    'button:has-text("확인")',
                    '.confirm_btn',
                ], timeout=3000, description="발행 확인(메인)")
                if confirm_btn:
                    await confirm_btn.click()
                    confirm_clicked = True
                    logger.info("발행 확인 클릭 (메인 셀렉터)")

            # JS 폴백: 발행 확인 팝업/패널 내 버튼 클릭
            if not confirm_clicked:
                logger.info("발행 확인 JS 폴백 시도")
                for target in ([editor, page] if editor != page else [page]):
                    try:
                        js_result = await target.evaluate('''() => {
                            // 발행 설정 패널/팝업 내에서 "발행" 버튼 찾기
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
                            // 팝업 못 찾으면 전체에서 "발행" 텍스트 정확히 매치
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
                await _random_delay(3, 5)
            else:
                logger.warning("발행 확인 버튼 미발견 (자동 발행 가능성)")
                await _random_delay(5, 8)

        except Exception as e:
            await _capture_debug(page, "publish_error")
            result["error"] = f"발행 버튼 클릭 실패: {e}"
            return result

        # 12. 발행 성공 확인 & URL 수집
        #     성공 기준: URL이 PostView 또는 postView 포함, 또는 글쓰기 페이지에서 이동
        await _random_delay(3, 5)
        current_url = page.url

        # 새 탭에서 발행 결과가 열릴 수 있음
        all_pages = page.context.pages
        for p in all_pages:
            p_url = p.url
            if "PostView" in p_url or "postView" in p_url:
                current_url = p_url
                break

        if "PostView" in current_url or "postView" in current_url:
            result["success"] = True
            result["url"] = current_url
            logger.info(f"발행 성공: {result['url']}")
        elif "Redirect=Write" in current_url or current_url == pre_publish_url:
            # 아직 글쓰기 페이지 → 발행 실패
            # 한번 더 대기 후 확인
            try:
                await page.wait_for_url(
                    lambda url: "PostView" in url or "postView" in url,
                    timeout=15000,
                )
                result["success"] = True
                result["url"] = page.url
                logger.info(f"발행 성공 (대기 후): {result['url']}")
            except Exception:
                await _capture_debug(page, "publish_not_navigated")
                result["error"] = f"발행 후 페이지 이동 없음 (URL: {current_url})"
                logger.warning(f"발행 실패: URL이 글쓰기 페이지에 머무름 → {current_url}")
        else:
            # blog.naver.com의 다른 페이지로 이동 → 성공 가능성
            result["success"] = True
            result["url"] = current_url
            logger.info(f"발행 완료 (URL 확인 필요): {result['url']}")

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"발행 중 오류: {e}")
        await _capture_debug(page, "publish_exception")

    return result


async def _create_stealth_context(playwright_instance):
    """네이버 봇 감지를 우회하기 위한 스텔스 브라우저 컨텍스트 생성"""
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-infobars",
        "--window-size=1920,1080",
    ]

    # 시스템 Chrome 사용 시도 (chromium_headless_shell 대신 → 봇 감지 우회)
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
    # navigator.webdriver 플래그 제거 (봇 감지 우회)
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
        window.chrome = { runtime: {} };
    """)
    return browser, context


async def _test_login_impl(account_id: int, naver_id: str, naver_password: str) -> dict:
    """로그인 테스트 구현부"""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser, context = await _create_stealth_context(p)
        page = await context.new_page()

        try:
            success = await login(page, account_id, naver_id, naver_password)
            return {"success": success, "message": "로그인 성공" if success else "로그인 실패"}
        except Exception as e:
            return {"success": False, "message": str(e)}
        finally:
            await browser.close()


async def test_login(account_id: int, naver_id: str, naver_password: str) -> dict:
    """로그인 테스트 (Windows ProactorEventLoop 호환)"""
    if sys.platform == "win32":
        return await asyncio.to_thread(
            _run_in_proactor_loop, _test_login_impl, account_id, naver_id, naver_password
        )
    return await _test_login_impl(account_id, naver_id, naver_password)


async def _run_publish_task_impl(
    account_id: int,
    naver_id: str,
    naver_password: str,
    title: str,
    content: str,
    category_name: str = "",
    tags: list = None,
    image_path: str = "",
    footer_link: str = "",
    footer_link_text: str = "",
) -> dict:
    """단일 문서 발행 구현부"""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser, context = await _create_stealth_context(p)
        page = await context.new_page()

        try:
            result = await publish_to_naver(
                page, account_id, naver_id, naver_password,
                title, content, category_name, tags, image_path,
                footer_link, footer_link_text,
            )
            return result
        except Exception as e:
            return {"success": False, "url": "", "error": str(e)}
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
    image_path: str = "",
    footer_link: str = "",
    footer_link_text: str = "",
) -> dict:
    """단일 문서 발행 실행 (Windows ProactorEventLoop 호환)"""
    if sys.platform == "win32":
        return await asyncio.to_thread(
            _run_in_proactor_loop, _run_publish_task_impl,
            account_id, naver_id, naver_password,
            title, content, category_name, tags, image_path,
            footer_link, footer_link_text,
        )
    return await _run_publish_task_impl(
        account_id, naver_id, naver_password,
        title, content, category_name, tags, image_path,
        footer_link, footer_link_text,
    )
