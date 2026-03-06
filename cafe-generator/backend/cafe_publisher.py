"""
Playwright 기반 네이버 카페 자동 발행 엔진
- 카페 전용 로직 (글쓰기 페이지 이동, 게시판 선택, 발행 URL 확인)
- SE ONE 공용 헬퍼는 se_helpers.py에서 가져옴
"""

import sys
import asyncio
import random
import logging

from se_helpers import (
    _run_in_proactor_loop,
    random_delay,
    try_selectors,
    capture_debug,
    login,
    create_stealth_context,
    se_detect_iframe,
    se_dismiss_popups,
    se_wait_editor,
    se_input_title,
    se_insert_image,
    se_input_body,
    se_insert_footer_link,
    se_input_tags,
    se_click_publish,
    dismiss_blocking_popup,
)

logger = logging.getLogger("cafe_publisher")


def _split_content_by_headings(content: str, image_count: int) -> list:
    """본문을 소제목(## / #) 기준으로 분할하여 이미지 삽입 위치를 만든다."""
    target_sections = image_count + 1
    lines = content.split("\n")

    heading_indices = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if i > 0 and (stripped.startswith("## ") or stripped.startswith("# ")):
            heading_indices.append(i)

    if len(heading_indices) >= image_count:
        step = len(heading_indices) / target_sections
        split_indices = []
        for j in range(1, target_sections):
            idx = int(j * step)
            idx = min(idx, len(heading_indices) - 1)
            split_indices.append(heading_indices[idx])
        split_indices = sorted(set(split_indices))
    else:
        total_lines = len(lines)
        split_indices = []
        for j in range(1, target_sections):
            split_indices.append(int(total_lines * j / target_sections))

    sections = []
    prev = 0
    for si in split_indices:
        section = "\n".join(lines[prev:si])
        if section.strip():
            sections.append(section)
        prev = si
    last_section = "\n".join(lines[prev:])
    if last_section.strip():
        sections.append(last_section)

    if not sections:
        sections = [content]

    return sections


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 카페 전용: 글쓰기 페이지 이동
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _navigate_to_cafe_write(page, cafe_id: str):
    """카페 글쓰기 페이지로 이동. (page, editor_page_reached) 반환."""
    editor_page_reached = False

    # --- 방법 A: 카페 메인에서 글쓰기 버튼 ---
    cafe_url = f"https://cafe.naver.com/{cafe_id}"
    logger.info(f"카페 메인으로 이동: {cafe_url}")
    await page.goto(cafe_url, wait_until="domcontentloaded", timeout=20000)
    await random_delay(2, 3)

    write_selectors = [
        'a[href*="ArticleWrite"]',
        'a[href*="articlewrite"]',
        'a:has-text("글쓰기")',
        'button:has-text("글쓰기")',
        '.btn_write',
        '#writeBtn',
        'a.link_write',
        '.cafe-write-btn',
    ]

    write_btn = await try_selectors(page, write_selectors, timeout=5000, description="글쓰기 버튼(카페메인)")
    if write_btn:
        logger.info("카페 글쓰기 버튼 발견 → 클릭")
        try:
            async with page.context.expect_page(timeout=10000) as new_page_info:
                await write_btn.click()
            new_page = await new_page_info.value
            await new_page.wait_for_load_state("domcontentloaded")
            page = new_page
            logger.info(f"새 탭에서 글쓰기 페이지 열림: {page.url}")
        except Exception:
            await page.wait_for_load_state("domcontentloaded")
            logger.info(f"같은 탭에서 글쓰기 페이지 로드: {page.url}")

        await random_delay(3, 5)
        page_content = await page.content()
        if "페이지 주소를 확인" not in page_content:
            editor_page_reached = True
            logger.info(f"글쓰기 페이지 도달 (버튼 클릭): {page.url}")

    # --- 방법 B: 직접 URL 이동 (폴백) ---
    if not editor_page_reached:
        write_urls = [
            f"https://cafe.naver.com/ca-fe/cafes/{cafe_id}/articles/write",
            f"https://cafe.naver.com/{cafe_id}/ArticleWrite.nhn",
        ]
        for write_url in write_urls:
            logger.info(f"직접 URL 이동 시도: {write_url}")
            try:
                await page.goto(write_url, wait_until="domcontentloaded", timeout=20000)
                await random_delay(3, 5)

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

    return page, editor_page_reached


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 카페 전용: 게시판(카테고리) 선택
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _select_cafe_board(editor, board_name: str):
    """카페 게시판 선택"""
    if not board_name:
        return

    try:
        board_btn = await try_selectors(editor, [
            'button:has-text("게시판")',
            'button:has-text("말머리")',
            'select[class*="board"]',
            '.board_select',
            'button[class*="board"]',
            '[class*="menu"] button',
            'button:has-text("게시판 선택")',
        ], timeout=3000, description="게시판 선택 버튼")
        if board_btn:
            await board_btn.click()
            await random_delay(0.5, 1)
            board_item = await try_selectors(editor, [
                f'li:has-text("{board_name}")',
                f'span:has-text("{board_name}")',
                f'a:has-text("{board_name}")',
                f'div:has-text("{board_name}")',
                f'option:has-text("{board_name}")',
            ], timeout=3000, description=f"게시판 항목({board_name})")
            if board_item:
                await board_item.click()
                await random_delay(0.5, 1)
                logger.info(f"게시판 선택 완료: {board_name}")
            else:
                # JS 폴백
                board_name_js = board_name.replace("'", "\\'")
                js_clicked = await editor.evaluate(f'''() => {{
                    const items = document.querySelectorAll(
                        'li, [class*="board"] span, [class*="menu"] a, [role="option"], option'
                    );
                    for (const item of items) {{
                        const text = (item.textContent || "").trim();
                        if (text === '{board_name_js}' || text.includes('{board_name_js}')) {{
                            item.click();
                            return true;
                        }}
                    }}
                    return false;
                }}''')
                if js_clicked:
                    logger.info(f"게시판 JS 폴백 성공: {board_name}")
                    await random_delay(0.5, 1)
                else:
                    logger.warning(f"게시판 항목 미발견: {board_name}")
    except Exception as e:
        logger.warning(f"게시판 선택 실패: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 카페 전용: 발행 URL 확인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _verify_cafe_publish(page, pre_publish_url: str) -> dict:
    """카페 발행 후 URL 확인. {"success": bool, "url": str, "error": str} 반환."""
    await random_delay(3, 5)
    current_url = page.url

    # 새 탭에서 발행 결과가 열릴 수 있음
    all_pages = page.context.pages
    for p in all_pages:
        p_url = p.url
        if "ArticleRead" in p_url or "articleRead" in p_url or "articles/" in p_url:
            current_url = p_url
            break

    if "ArticleRead" in current_url or "articleRead" in current_url or "articles/" in current_url:
        logger.info(f"카페 발행 성공: {current_url}")
        return {"success": True, "url": current_url, "error": ""}
    elif current_url == pre_publish_url:
        try:
            await page.wait_for_url(
                lambda url: "ArticleRead" in url or "articleRead" in url or "articles/" in url,
                timeout=15000,
            )
            logger.info(f"카페 발행 성공 (대기 후): {page.url}")
            return {"success": True, "url": page.url, "error": ""}
        except Exception:
            await capture_debug(page, "cafe_publish_not_navigated")
            logger.warning(f"카페 발행 실패: URL이 글쓰기 페이지에 머무름 → {current_url}")
            return {"success": False, "url": "", "error": f"발행 후 페이지 이동 없음 (URL: {current_url})"}
    else:
        logger.info(f"카페 발행 완료 (URL 확인 필요): {current_url}")
        return {"success": True, "url": current_url, "error": ""}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인 발행 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def publish_to_cafe(
    page,
    account_id: int,
    naver_id: str,
    naver_password: str,
    cafe_id: str,
    title: str,
    content: str,
    board_name: str = "",
    tags: list = None,
    image_path: str = "",
    footer_link: str = "",
    footer_link_text: str = "",
    extra_image_paths: list = None,
) -> dict:
    """네이버 카페에 글을 발행합니다."""
    result = {"success": False, "url": "", "error": ""}
    tags = tags or []
    extra_image_paths = extra_image_paths or []

    try:
        # 1. 로그인
        logged_in = await login(page, account_id, naver_id, naver_password)
        if not logged_in:
            result["error"] = "로그인 실패"
            return result

        await random_delay(2, 3)

        # 2. 카페 글쓰기 페이지 이동
        page, editor_page_reached = await _navigate_to_cafe_write(page, cafe_id)

        if not editor_page_reached:
            await capture_debug(page, "cafe_write_page_unreachable")
            result["error"] = (
                f"카페 글쓰기 페이지 접근 실패. "
                f"① 카페에 가입되어 있는지 확인하세요. "
                f"② 브라우저에서 https://cafe.naver.com/{cafe_id} 접속이 되는지 확인하세요. "
                f"(cafeId={cafe_id})"
            )
            return result

        # 3. iframe 감지
        editor = await se_detect_iframe(page)

        # 4. 팝업 처리
        await se_dismiss_popups(page, editor)

        # 5. 에디터 로딩 대기
        editor_loaded, editor = await se_wait_editor(page, editor)

        if not editor_loaded:
            await capture_debug(page, "cafe_editor_not_loaded")
            current_url = page.url
            page_title = await page.title()
            try:
                body_text = await page.evaluate("document.body?.innerText?.substring(0, 500) || ''")
                logger.error(f"에디터 미발견 - URL: {current_url}, 제목: {page_title}, 본문: {body_text[:200]}")
            except Exception:
                pass
            result["error"] = f"에디터 로딩 실패 (URL: {current_url}, 제목: {page_title})"
            return result

        await random_delay(1, 2)
        await dismiss_blocking_popup(editor, "에디터 로딩 후")

        # 6. 게시판 선택
        await _select_cafe_board(editor, board_name)

        # 7. 제목 입력
        title_entered = await se_input_title(page, editor, title)
        if not title_entered:
            await capture_debug(page, "cafe_title_failed")
            result["error"] = "제목 입력 실패"
            return result

        # 8. 본문 영역으로 이동
        await page.keyboard.press("Tab")
        await random_delay(1, 2)

        # 8-1. 대표이미지 삽입
        await se_insert_image(page, editor, image_path)

        # 8-2. 본문 + 추가 이미지 분산 삽입
        if extra_image_paths:
            sections = _split_content_by_headings(content, len(extra_image_paths))
            for sec_idx, section_text in enumerate(sections):
                await se_input_body(page, editor, section_text)
                if sec_idx < len(extra_image_paths):
                    await se_insert_image(page, editor, extra_image_paths[sec_idx])
        else:
            # 9. 본문 입력
            await se_input_body(page, editor, content)

        # 9-1. 하단 링크 삽입
        await se_insert_footer_link(page, editor, footer_link, footer_link_text)

        await random_delay(2, 3)

        # 10. 태그 입력
        await se_input_tags(page, editor, tags)

        # 11. 발행 버튼 클릭
        pre_publish_url = page.url
        publish_ok = await se_click_publish(page, editor)
        if not publish_ok:
            result["error"] = "발행 버튼을 찾을 수 없습니다"
            return result

        # 12. 발행 URL 확인
        result = await _verify_cafe_publish(page, pre_publish_url)

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"카페 발행 중 오류: {e}")
        await capture_debug(page, "cafe_publish_exception")

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 진입점 (Windows 호환)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _test_login_impl(account_id: int, naver_id: str, naver_password: str) -> dict:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser, context = await create_stealth_context(p, account_id=account_id)
        page = await context.new_page()

        try:
            success = await login(page, account_id, naver_id, naver_password)
            return {"success": success, "message": "로그인 성공" if success else "로그인 실패"}
        except Exception as e:
            return {"success": False, "message": str(e)}
        finally:
            await browser.close()


async def test_login(account_id: int, naver_id: str, naver_password: str) -> dict:
    if sys.platform == "win32":
        return await asyncio.to_thread(
            _run_in_proactor_loop, _test_login_impl, account_id, naver_id, naver_password
        )
    return await _test_login_impl(account_id, naver_id, naver_password)


async def _run_publish_task_impl(
    account_id: int,
    naver_id: str,
    naver_password: str,
    cafe_id: str,
    title: str,
    content: str,
    board_name: str = "",
    tags: list = None,
    image_path: str = "",
    footer_link: str = "",
    footer_link_text: str = "",
    extra_image_paths: list = None,
) -> dict:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser, context = await create_stealth_context(p, account_id=account_id)
        page = await context.new_page()

        try:
            result = await publish_to_cafe(
                page, account_id, naver_id, naver_password,
                cafe_id, title, content, board_name, tags, image_path,
                footer_link, footer_link_text,
                extra_image_paths=extra_image_paths,
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
    cafe_id: str,
    title: str,
    content: str,
    board_name: str = "",
    tags: list = None,
    image_path: str = "",
    footer_link: str = "",
    footer_link_text: str = "",
    extra_image_paths: list = None,
) -> dict:
    """단일 문서 카페 발행 실행 (Windows ProactorEventLoop 호환)"""
    if sys.platform == "win32":
        return await asyncio.to_thread(
            _run_in_proactor_loop, _run_publish_task_impl,
            account_id, naver_id, naver_password,
            cafe_id, title, content, board_name, tags, image_path,
            footer_link, footer_link_text, extra_image_paths,
        )
    return await _run_publish_task_impl(
        account_id, naver_id, naver_password,
        cafe_id, title, content, board_name, tags, image_path,
        footer_link, footer_link_text, extra_image_paths,
    )
