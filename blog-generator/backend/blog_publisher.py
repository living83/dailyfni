"""
Playwright 기반 네이버 블로그 자동 발행 엔진
- 블로그 전용 로직 (글쓰기 페이지 이동, 카테고리 선택, 발행 URL 확인)
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

logger = logging.getLogger("blog_publisher")


def _split_content_by_headings(content: str, image_count: int) -> list:
    """본문을 소제목(## / #) 기준으로 분할하여 이미지 삽입 위치를 만든다.
    image_count개의 이미지가 섹션 사이에 들어갈 수 있도록 (image_count + 1)개 섹션으로 분할.
    소제목이 부족하면 빈 줄 기준으로 균등 분할한다."""
    target_sections = image_count + 1
    lines = content.split("\n")

    # 소제목 위치 찾기 (첫 줄 제외)
    heading_indices = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if i > 0 and (stripped.startswith("## ") or stripped.startswith("# ")):
            heading_indices.append(i)

    # 소제목이 충분하면 소제목 기준으로 분할
    if len(heading_indices) >= image_count:
        # image_count개의 분할 지점 선택 (균등 분포)
        step = len(heading_indices) / target_sections
        split_indices = []
        for j in range(1, target_sections):
            idx = int(j * step)
            idx = min(idx, len(heading_indices) - 1)
            split_indices.append(heading_indices[idx])
        # 중복 제거 및 정렬
        split_indices = sorted(set(split_indices))
    else:
        # 소제목 부족 시 줄 수 기준 균등 분할
        total_lines = len(lines)
        split_indices = []
        for j in range(1, target_sections):
            split_indices.append(int(total_lines * j / target_sections))

    # 분할 실행
    sections = []
    prev = 0
    for si in split_indices:
        section = "\n".join(lines[prev:si])
        if section.strip():
            sections.append(section)
        prev = si
    # 마지막 섹션
    last_section = "\n".join(lines[prev:])
    if last_section.strip():
        sections.append(last_section)

    # 섹션이 비었으면 원본 그대로
    if not sections:
        sections = [content]

    return sections


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 블로그 전용: 글쓰기 페이지 이동
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _navigate_to_blog_write(page, naver_id: str):
    """블로그 글쓰기 페이지로 이동. (page, editor_page_reached) 반환."""
    editor_page_reached = False

    # --- 방법 A: blog.naver.com 메인에서 글쓰기 버튼 ---
    logger.info(f"현재 페이지 URL: {page.url}")
    if "blog.naver.com" not in page.url:
        await page.goto("https://blog.naver.com", wait_until="domcontentloaded", timeout=20000)
        await random_delay(2, 3)
        logger.info(f"blog.naver.com 이동 완료: {page.url}")

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

    write_btn = await try_selectors(page, write_selectors, timeout=5000, description="글쓰기 버튼(메인)")
    if not write_btn:
        # 방법 B: 내 블로그 페이지로 이동 후 시도
        blog_url = f"https://blog.naver.com/{naver_id}"
        logger.info(f"메인에서 글쓰기 버튼 없음 → 내 블로그 이동: {blog_url}")
        await page.goto(blog_url, wait_until="domcontentloaded", timeout=20000)
        await random_delay(2, 3)

        page_content = await page.content()
        if "페이지 주소를 확인" in page_content:
            logger.warning(f"내 블로그 404: {blog_url}")
            await capture_debug(page, "my_blog_404")
        else:
            write_btn = await try_selectors(page, write_selectors, timeout=5000, description="글쓰기 버튼(내블로그)")

    if write_btn:
        logger.info("글쓰기 버튼 발견 → 클릭")
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
# 블로그 전용: 카테고리 선택
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _select_blog_category(editor, category_name: str):
    """블로그 카테고리 선택"""
    if not category_name:
        return

    try:
        cat_btn = await try_selectors(editor, [
            'button:has-text("카테고리")',
            '.blog_category_btn',
            '.publish_category_btn',
            'button[class*="category"]',
            '[class*="category"] button',
        ], timeout=3000, description="카테고리 버튼")
        if cat_btn:
            await cat_btn.click()
            await random_delay(0.5, 1)
            cat_item = await try_selectors(editor, [
                f'li:has-text("{category_name}")',
                f'span:has-text("{category_name}")',
                f'a:has-text("{category_name}")',
                f'div:has-text("{category_name}")',
                f'button:has-text("{category_name}")',
            ], timeout=3000, description=f"카테고리 항목({category_name})")
            if cat_item:
                await cat_item.click()
                await random_delay(0.5, 1)
            else:
                # JS 폴백
                cat_name_js = category_name.replace("'", "\\'")
                js_clicked = await editor.evaluate(f'''() => {{
                    const items = document.querySelectorAll(
                        'li, [class*="category"] span, [class*="category"] a, [role="option"]'
                    );
                    for (const item of items) {{
                        const text = (item.textContent || "").trim();
                        if (text === '{cat_name_js}' || text.includes('{cat_name_js}')) {{
                            item.click();
                            return true;
                        }}
                    }}
                    return false;
                }}''')
                if js_clicked:
                    logger.info(f"카테고리 JS 폴백 성공: {category_name}")
                    await random_delay(0.5, 1)
                else:
                    logger.warning(f"카테고리 항목 미발견: {category_name}")
    except Exception as e:
        logger.warning(f"카테고리 선택 실패: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 블로그 전용: 발행 URL 확인
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _verify_blog_publish(page, pre_publish_url: str) -> dict:
    """블로그 발행 후 URL 확인. {"success": bool, "url": str, "error": str} 반환."""
    await random_delay(3, 5)
    current_url = page.url

    # 새 탭에서 발행 결과가 열릴 수 있음
    all_pages = page.context.pages
    for p in all_pages:
        p_url = p.url
        if "PostView" in p_url or "postView" in p_url:
            current_url = p_url
            break

    if "PostView" in current_url or "postView" in current_url:
        logger.info(f"발행 성공: {current_url}")
        return {"success": True, "url": current_url, "error": ""}
    elif "Redirect=Write" in current_url or current_url == pre_publish_url:
        try:
            await page.wait_for_url(
                lambda url: "PostView" in url or "postView" in url,
                timeout=15000,
            )
            logger.info(f"발행 성공 (대기 후): {page.url}")
            return {"success": True, "url": page.url, "error": ""}
        except Exception:
            await capture_debug(page, "publish_not_navigated")
            logger.warning(f"발행 실패: URL이 글쓰기 페이지에 머무름 → {current_url}")
            return {"success": False, "url": "", "error": f"발행 후 페이지 이동 없음 (URL: {current_url})"}
    else:
        logger.info(f"발행 완료 (URL 확인 필요): {current_url}")
        return {"success": True, "url": current_url, "error": ""}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 메인 발행 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def publish_to_blog(
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
    extra_image_paths: list = None,
) -> dict:
    """네이버 블로그에 글을 발행합니다."""
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

        # 2. 블로그 글쓰기 페이지 이동
        page, editor_page_reached = await _navigate_to_blog_write(page, naver_id)

        if not editor_page_reached:
            await capture_debug(page, "write_page_unreachable")
            result["error"] = (
                f"글쓰기 페이지 접근 실패. "
                f"① 블로그가 개설되어 있는지 확인하세요. "
                f"② 브라우저에서 https://blog.naver.com/{naver_id} 접속이 되는지 확인하세요. "
                f"(blogId={naver_id})"
            )
            return result

        # 3. iframe 감지
        editor = await se_detect_iframe(page)

        # 4. 팝업 처리
        await se_dismiss_popups(page, editor)

        # 5. 에디터 로딩 대기
        editor_loaded, editor = await se_wait_editor(page, editor)

        if not editor_loaded:
            await capture_debug(page, "editor_not_loaded")
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

        # 6. 카테고리 선택
        await _select_blog_category(editor, category_name)

        # 7. 제목 입력
        title_entered = await se_input_title(page, editor, title)
        if not title_entered:
            await capture_debug(page, "title_failed")
            result["error"] = "제목 입력 실패"
            return result

        # 8. 본문 영역으로 이동
        await page.keyboard.press("Tab")
        await random_delay(1, 2)

        # 8-1. 대표이미지 삽입
        await se_insert_image(page, editor, image_path)

        # 8-2. 본문 + 추가 이미지 분산 삽입
        if extra_image_paths:
            # 본문을 소제목(##) 기준으로 섹션 분할하여 이미지를 중간에 배치
            sections = _split_content_by_headings(content, len(extra_image_paths))
            for sec_idx, section_text in enumerate(sections):
                await se_input_body(page, editor, section_text)
                # 섹션 뒤에 이미지 삽입 (마지막 섹션 제외, 이미지가 남아있을 때)
                if sec_idx < len(extra_image_paths):
                    await se_insert_image(page, editor, extra_image_paths[sec_idx])
        else:
            # 9. 본문 입력 (추가 이미지 없으면 기존 방식)
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
        result = await _verify_blog_publish(page, pre_publish_url)

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"발행 중 오류: {e}")
        await capture_debug(page, "publish_exception")

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
    title: str,
    content: str,
    category_name: str = "",
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
            result = await publish_to_blog(
                page, account_id, naver_id, naver_password,
                title, content, category_name, tags, image_path,
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
    title: str,
    content: str,
    category_name: str = "",
    tags: list = None,
    image_path: str = "",
    footer_link: str = "",
    footer_link_text: str = "",
    extra_image_paths: list = None,
) -> dict:
    """단일 문서 발행 실행 (Windows ProactorEventLoop 호환)"""
    if sys.platform == "win32":
        return await asyncio.to_thread(
            _run_in_proactor_loop, _run_publish_task_impl,
            account_id, naver_id, naver_password,
            title, content, category_name, tags, image_path,
            footer_link, footer_link_text, extra_image_paths,
        )
    return await _run_publish_task_impl(
        account_id, naver_id, naver_password,
        title, content, category_name, tags, image_path,
        footer_link, footer_link_text, extra_image_paths,
    )
