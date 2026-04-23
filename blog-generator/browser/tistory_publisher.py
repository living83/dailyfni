"""
tistory_publisher.py — 티스토리 블로그 자동 발행 엔진
카카오 로그인 → 글쓰기 페이지 → 제목/본문/태그 입력 → 발행
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
    capture_debug,
    random_delay,
)
from browser.tistory_helpers import kakao_login
from config import settings


async def publish_tistory_post(account: dict, post_data: dict) -> dict:
    """
    티스토리 블로그에 글을 발행합니다.

    Args:
        account: {
            id, account_name, blog_name,  ← xxx.tistory.com의 xxx
            kakao_id, kakao_password
        }
        post_data: {
            title, content, keyword, tags (comma separated),
            category (optional), post_type ('general'|'ad')
        }

    Returns:
        { success, url, error }
    """
    result = {"success": False, "url": None, "error": None}

    blog_name = account.get("blog_name", "")
    account_name = account.get("account_name", blog_name)
    proxy = await _get_proxy_for_account(account.get("id", 0))
    headless = getattr(settings, "HEADLESS", True)

    if not blog_name:
        result["error"] = "blog_name이 설정되지 않았습니다."
        return result

    async with async_playwright() as p:
        browser, context = await create_stealth_context(p, proxy=proxy, headless=headless)
        try:
            # ── 1. 카카오 로그인 ──
            ok = await kakao_login(
                context,
                kakao_id=account["kakao_id"],
                kakao_password=account["kakao_password"],
                account_id=account.get("id", "0"),
            )
            if not ok:
                result["error"] = "카카오 로그인 실패"
                return result

            page = await context.new_page()

            # ── 2. 글쓰기 페이지 이동 ──
            write_url = f"https://{blog_name}.tistory.com/manage/newpost"
            logger.info(f"[{account_name}] 글쓰기 페이지: {write_url}")
            await page.goto(write_url, wait_until="domcontentloaded", timeout=30000)
            await random_delay(2, 3)

            # 디버그: 현재 URL 및 스크린샷 저장
            actual_url = page.url
            logger.info(f"[{account_name}] 실제 URL: {actual_url}")

            debug_dir = Path(settings.IMAGES_DIR) / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            try:
                await page.screenshot(
                    path=str(debug_dir / f"tistory_write_{blog_name}.png"),
                    full_page=True,
                )
                html = await page.content()
                (debug_dir / f"tistory_write_{blog_name}.html").write_text(
                    html, encoding="utf-8"
                )
            except Exception:
                pass

            # ── 3. 제목 입력 ──
            title = post_data.get("title", post_data.get("keyword", ""))
            title_selectors = [
                "#post-title-inp",
                'input[placeholder*="제목"]',
                ".tit_post input",
                "#title",
                '[data-placeholder="제목을 입력하세요"]',
            ]
            title_el = None
            for sel in title_selectors:
                title_el = await page.query_selector(sel)
                if title_el:
                    logger.info(f"[{account_name}] 제목 필드: {sel}")
                    break

            if title_el:
                await title_el.click()
                await random_delay(0.3, 0.5)
                await page.keyboard.type(title, delay=random.randint(30, 50))
                await random_delay(0.5, 1)
            else:
                logger.error(f"[{account_name}] 제목 입력 필드를 찾지 못했습니다.")
                await capture_debug(page, f"tistory_no_title_{blog_name}")
                result["error"] = "제목 입력 필드 없음"
                return result

            # ── 4. 대표이미지 삽입 ──
            post_type = post_data.get("post_type", "general")
            is_ad_post = (post_type == "ad")
            target_keyword = post_data.get("keyword", "")
            target_title = post_data.get("title", target_keyword)

            try:
                from ai.image_generator import generate_image_with_gemini
                img_description = ""
                raw_content = post_data.get("content", "")
                if raw_content:
                    import re as _img_re
                    plain = _img_re.sub(r'<[^>]+>', '', raw_content).strip()[:200]
                    img_description = plain

                logger.info(f"[{account_name}] 이미지 생성 중: '{target_title[:30]}'")
                img_path = await generate_image_with_gemini(
                    target_keyword, is_ad=is_ad_post,
                    title=target_title, description=img_description,
                )
                if img_path:
                    await _insert_tistory_image(page, img_path, account_name)
            except Exception as e:
                logger.warning(f"[{account_name}] 이미지 삽입 실패 (계속 진행): {e}")

            # ── 5. 본문 입력 ──
            content = post_data.get("content", "")
            if content:
                await _input_tistory_body(page, content, account_name)

            # ── 5. 태그 입력 ──
            tags = post_data.get("tags", post_data.get("keyword", ""))
            if tags:
                await _input_tistory_tags(page, tags, account_name)

            # ── 6. 카테고리 선택 (선택사항) ──
            category = post_data.get("category", "")
            if category:
                await _select_tistory_category(page, category, account_name)

            # ── 7. 발행 ──
            publish_result = await _publish_tistory(page, account_name)
            if publish_result.get("success"):
                result["success"] = True
                result["url"] = publish_result.get("url", "")
                logger.info(f"[{account_name}] 티스토리 발행 성공: {result['url']}")
            else:
                result["error"] = publish_result.get("error", "발행 실패")
                logger.error(f"[{account_name}] 티스토리 발행 실패: {result['error']}")

        except Exception as e:
            logger.exception(f"[{account_name}] 티스토리 발행 예외: {e}")
            result["error"] = str(e)
        finally:
            try:
                await context.close()
                await browser.close()
            except Exception:
                pass

    return result


async def _insert_tistory_image(page, img_path: str, account_name: str):
    """티스토리 에디터에 이미지 파일 삽입"""
    try:
        # 이미지 버튼 클릭
        img_btn_selectors = [
            'button[data-name="image"]',
            'button[title*="이미지"]',
            '.btn_image',
            'button:has-text("사진")',
            '[class*="image"] button',
        ]
        img_btn = None
        for sel in img_btn_selectors:
            img_btn = await page.query_selector(sel)
            if img_btn:
                break

        # file input 직접 찾기 (버튼 없어도)
        file_input = await page.query_selector('input[type="file"][accept*="image"]')
        if not file_input:
            file_input = await page.query_selector('input[type="file"]')

        if file_input:
            await file_input.set_input_files(img_path)
            await random_delay(3, 5)
            logger.info(f"[{account_name}] 이미지 업로드 완료: {img_path}")
            return

        if img_btn:
            await img_btn.click()
            await random_delay(1, 2)
            # 클릭 후 file input 다시 찾기
            file_input = await page.query_selector('input[type="file"]')
            if file_input:
                await file_input.set_input_files(img_path)
                await random_delay(3, 5)
                logger.info(f"[{account_name}] 이미지 업로드 완료 (버튼 클릭 후)")
                return

        logger.warning(f"[{account_name}] 이미지 삽입 요소를 찾지 못함 (건너뜀)")
    except Exception as e:
        logger.warning(f"[{account_name}] 이미지 삽입 예외: {e}")


async def _input_tistory_body(page, content: str, account_name: str):
    """티스토리 에디터에 본문 입력"""
    # HTML 모드 전환 시도 (더 안정적)
    html_mode_btn = await page.query_selector(
        'button:has-text("HTML"), .btn_html, [data-mode="html"], '
        'button[title="HTML"], .switch_html'
    )
    if html_mode_btn:
        await html_mode_btn.click()
        await random_delay(0.5, 1)
        logger.info(f"[{account_name}] HTML 모드 전환")

        # HTML 모드 텍스트 에디어에 직접 입력
        html_editor = await page.query_selector(
            'textarea.html, #html-editor, textarea, .CodeMirror textarea'
        )
        if html_editor:
            # HTML 태그로 본문 구성
            html_content = _text_to_html(content)
            await html_editor.fill(html_content)
            await random_delay(0.5, 1)
            logger.info(f"[{account_name}] HTML 모드 본문 입력 완료")
            return

    # WYSIWYG 모드: contenteditable 영역에 입력
    body_selectors = [
        '#tinymce',
        '.mce-content-body',
        '[contenteditable="true"]',
        '#content',
        '.editor_content',
        '.post_content',
        'iframe#editor_ifr',
    ]

    # iframe 내부 에디터 확인
    for frame in page.frames:
        body_el = await frame.query_selector('[contenteditable="true"], body#tinymce, body')
        if body_el:
            editable = await body_el.get_attribute("contenteditable")
            if editable == "true" or await body_el.evaluate('el => el.id === "tinymce"'):
                await body_el.click()
                await random_delay(0.5, 1)
                # 줄 단위로 입력
                for line in content.split("\n"):
                    if line.strip():
                        await page.keyboard.type(line.strip(), delay=random.randint(20, 40))
                    await page.keyboard.press("Enter")
                logger.info(f"[{account_name}] iframe 에디터 본문 입력 완료")
                return

    # 메인 페이지에서 contenteditable 직접 시도
    for sel in body_selectors:
        body_el = await page.query_selector(sel)
        if body_el:
            await body_el.click()
            await random_delay(0.5, 1)
            for line in content.split("\n"):
                if line.strip():
                    await page.keyboard.type(line.strip(), delay=random.randint(20, 40))
                await page.keyboard.press("Enter")
            logger.info(f"[{account_name}] 본문 입력 완료 (셀렉터: {sel})")
            return

    logger.warning(f"[{account_name}] 본문 입력 영역을 찾지 못했습니다.")
    await capture_debug(page, f"tistory_no_body_{account_name}")


def _text_to_html(text: str) -> str:
    """플레인 텍스트를 HTML 단락으로 변환"""
    lines = text.split("\n")
    html_parts = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("## "):
            html_parts.append(f"<h3>{stripped[3:]}</h3>")
        elif stripped.startswith("# "):
            html_parts.append(f"<h2>{stripped[2:]}</h2>")
        elif stripped.startswith("- "):
            html_parts.append(f"<p>• {stripped[2:]}</p>")
        else:
            html_parts.append(f"<p>{stripped}</p>")
    return "\n".join(html_parts)


async def _input_tistory_tags(page, tags: str, account_name: str):
    """태그 입력"""
    tag_selectors = [
        '#tagText',
        'input[placeholder*="태그"]',
        '.tag_input input',
        '#tag-input',
        'input[name="tag"]',
    ]
    for sel in tag_selectors:
        tag_el = await page.query_selector(sel)
        if tag_el:
            tag_list = [t.strip() for t in tags.replace(",", ",").split(",") if t.strip()]
            for tag in tag_list:
                await tag_el.click()
                await page.keyboard.type(tag, delay=random.randint(30, 50))
                await page.keyboard.press("Enter")
                await random_delay(0.3, 0.5)
            logger.info(f"[{account_name}] 태그 입력: {', '.join(tag_list)}")
            return

    logger.debug(f"[{account_name}] 태그 입력 필드 미발견 (건너뜀)")


async def _select_tistory_category(page, category: str, account_name: str):
    """카테고리 선택"""
    cat_selectors = [
        '#category-btn',
        '.btn_category',
        'button:has-text("카테고리")',
        'select#category',
    ]
    for sel in cat_selectors:
        cat_el = await page.query_selector(sel)
        if cat_el:
            tag_name = await cat_el.evaluate("el => el.tagName.toLowerCase()")
            if tag_name == "select":
                await cat_el.select_option(label=category)
            else:
                await cat_el.click()
                await random_delay(0.5, 1)
                cat_option = await page.query_selector(f'text="{category}"')
                if cat_option:
                    await cat_option.click()
            logger.info(f"[{account_name}] 카테고리 선택: {category}")
            return

    logger.debug(f"[{account_name}] 카테고리 셀렉터 미발견 (건너뜀)")


async def _publish_tistory(page, account_name: str) -> dict:
    """발행 버튼 클릭 + URL 추출"""
    # 발행 버튼 (완료/발행/공개발행 등)
    publish_selectors = [
        '#publish-layer-btn',
        'button:has-text("완료")',
        'button:has-text("발행")',
        'button:has-text("공개 발행")',
        '.btn_publish',
        '#btn_publish',
        'button.btn_point',
    ]

    for sel in publish_selectors:
        btn = await page.query_selector(sel)
        if btn and await btn.is_visible():
            await btn.click()
            await random_delay(2, 3)
            logger.info(f"[{account_name}] 발행 버튼 클릭: {sel}")

            # 확인 팝업이 뜰 수 있음 (공개/보호/비공개 선택)
            confirm_selectors = [
                'button:has-text("공개")',
                'button:has-text("발행")',
                'button:has-text("확인")',
                '.btn_ok',
                '#publish-btn',
            ]
            for csol in confirm_selectors:
                cbtn = await page.query_selector(csol)
                if cbtn and await cbtn.is_visible():
                    await cbtn.click()
                    await random_delay(2, 3)
                    logger.info(f"[{account_name}] 발행 확인: {csol}")
                    break

            # 발행 후 URL 추출
            await random_delay(2, 3)
            current_url = page.url

            # /manage/write에서 벗어났으면 발행된 글 URL
            if "/manage/write" not in current_url and "tistory.com" in current_url:
                return {"success": True, "url": current_url}

            # URL이 아직 write 페이지면 → 주소창이 아닌 다른 방법으로 추출
            # 최근 발행 글 목록에서 추출 시도
            try:
                await page.goto(
                    f"https://{page.url.split('.tistory.com')[0].split('//')[-1]}.tistory.com/manage/posts",
                    wait_until="domcontentloaded",
                    timeout=15000,
                )
                await random_delay(1, 2)
                first_link = await page.query_selector('.post_title a, .tit_post a, table a')
                if first_link:
                    url = await first_link.get_attribute("href")
                    if url:
                        return {"success": True, "url": url}
            except Exception:
                pass

            return {"success": True, "url": f"발행 완료 (URL 미추출)"}

    await capture_debug(page, f"tistory_no_publish_btn_{account_name}")
    return {"success": False, "error": "발행 버튼을 찾을 수 없습니다."}
