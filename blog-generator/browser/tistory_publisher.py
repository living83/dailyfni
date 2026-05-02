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
            # TinyMCE iframe 로딩 대기
            try:
                await page.wait_for_selector(
                    'iframe#editor-tistory_ifr, iframe[id$="_ifr"]',
                    timeout=15000,
                )
                await random_delay(1, 2)
                logger.info(f"[{account_name}] TinyMCE 에디터 iframe 로딩 확인")
            except Exception:
                logger.warning(f"[{account_name}] TinyMCE iframe 대기 타임아웃, 진행 시도")
                await random_delay(2, 3)

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
    """티스토리 에디터에 이미지 파일 삽입 (base64 우선)"""
    import base64

    img_path_obj = Path(img_path)
    if not img_path_obj.exists():
        logger.warning(f"[{account_name}] 이미지 파일 없음: {img_path}")
        return

    # ── 방법 1 (최우선): TinyMCE iframe에 base64 이미지 직접 삽입 ──
    # 타임아웃 위험 없이 가장 확실한 방식
    try:
        iframe_el = await page.wait_for_selector(
            'iframe#editor-tistory_ifr, iframe[id$="_ifr"]', timeout=10000
        )
        if iframe_el:
            frame = await iframe_el.content_frame()
            if frame:
                body_el = await frame.wait_for_selector(
                    'body#tinymce, body.mce-content-body', timeout=5000
                )
                if body_el:
                    img_data = img_path_obj.read_bytes()
                    b64 = base64.b64encode(img_data).decode()
                    suffix = img_path_obj.suffix.lower().lstrip('.')
                    mime = f"image/{'jpeg' if suffix in ('jpg','jpeg') else suffix}"

                    await frame.evaluate('''(imgSrc) => {
                        const body = document.querySelector('body#tinymce') || document.body;
                        const img = document.createElement('img');
                        img.src = imgSrc;
                        img.style.maxWidth = '100%';
                        img.style.display = 'block';
                        img.style.margin = '10px auto';
                        body.insertBefore(img, body.firstChild);
                    }''', f'data:{mime};base64,{b64}')
                    await random_delay(0.5, 1)
                    logger.info(f"[{account_name}] 이미지 삽입 완료 (base64 → TinyMCE)")
                    return
    except Exception as e:
        logger.debug(f"[{account_name}] base64 이미지 삽입 실패: {e}")

    # ── 방법 2: file input 직접 찾기 ──
    try:
        file_input = await page.query_selector('input[type="file"][accept*="image"]')
        if not file_input:
            file_input = await page.query_selector('input[type="file"]')
        if file_input:
            await file_input.set_input_files(img_path)
            await random_delay(3, 5)
            logger.info(f"[{account_name}] 이미지 업로드 완료 (file input)")
            return
    except Exception as e:
        logger.debug(f"[{account_name}] file input 이미지 삽입 실패: {e}")

    logger.warning(f"[{account_name}] 이미지 삽입 실패 (건너뜀)")


async def _input_tistory_body(page, content: str, account_name: str):
    """티스토리 에디터에 본문 입력 (TinyMCE iframe 방식)"""

    html_content = _text_to_html(content)

    # ── 방법 1: TinyMCE iframe 직접 접근 (가장 안정적) ──
    # 티스토리 에디터의 iframe ID: editor-tistory_ifr
    iframe_selectors = [
        'iframe#editor-tistory_ifr',
        'iframe[id$="_ifr"]',
        'iframe.tox-edit-area__iframe',
    ]

    for sel in iframe_selectors:
        try:
            iframe_el = await page.wait_for_selector(sel, timeout=10000)
            if iframe_el:
                frame = await iframe_el.content_frame()
                if frame:
                    # TinyMCE body가 준비될 때까지 대기
                    body_el = await frame.wait_for_selector(
                        'body#tinymce, body.mce-content-body', timeout=5000
                    )
                    if body_el:
                        # 기존 이미지 보존하면서 본문 HTML 추가
                        await frame.evaluate('''(newHtml) => {
                            const body = document.querySelector('body#tinymce') || document.body;
                            const existingImages = body.querySelectorAll('img');
                            const imgHtmls = Array.from(existingImages).map(i => i.outerHTML);
                            body.innerHTML = imgHtmls.join('') + newHtml;
                        }''', html_content)
                        await random_delay(0.5, 1)
                        logger.info(f"[{account_name}] TinyMCE iframe 본문 입력 완료 ({sel})")
                        return
        except Exception as e:
            logger.debug(f"[{account_name}] iframe 셀렉터 {sel} 실패: {e}")
            continue

    # ── 방법 2: page.frames 순회 ──
    for frame in page.frames:
        if frame == page.main_frame:
            continue
        try:
            body_el = await frame.query_selector('body#tinymce, body.mce-content-body')
            if body_el:
                await frame.evaluate('''(newHtml) => {
                    const body = document.querySelector('body#tinymce') || document.body;
                    const existingImages = body.querySelectorAll('img');
                    const imgHtmls = Array.from(existingImages).map(i => i.outerHTML);
                    body.innerHTML = imgHtmls.join('') + newHtml;
                }''', html_content)
                await random_delay(0.5, 1)
                logger.info(f"[{account_name}] frame 순회 본문 입력 완료")
                return
        except Exception:
            continue

    # ── 방법 3: HTML 모드 전환 후 textarea 입력 ──
    html_mode_btn = await page.query_selector(
        'button:has-text("HTML"), .btn_html, [data-mode="html"]'
    )
    if html_mode_btn:
        await html_mode_btn.click()
        await random_delay(0.5, 1)
        html_editor = await page.query_selector('textarea.html, #html-editor, textarea')
        if html_editor:
            await html_editor.fill(html_content)
            await random_delay(0.5, 1)
            logger.info(f"[{account_name}] HTML 모드 본문 입력 완료")
            return

    # ── 방법 4: contenteditable 직접 시도 ──
    for sel in ['[contenteditable="true"]', '.mce-content-body', '#content']:
        body_el = await page.query_selector(sel)
        if body_el:
            await body_el.click()
            await random_delay(0.3, 0.5)
            await page.keyboard.type(content[:50], delay=30)
            logger.info(f"[{account_name}] contenteditable 본문 입력 ({sel})")
            return

    # 디버그 로그: 페이지 내 iframe 목록 출력
    iframe_info = await page.evaluate('''() => {
        const iframes = document.querySelectorAll('iframe');
        return Array.from(iframes).map(f => ({id: f.id, name: f.name, src: f.src?.substring(0, 100)}));
    }''')
    logger.warning(f"[{account_name}] 본문 입력 영역을 찾지 못함. iframes: {iframe_info}")
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
    blog_name = page.url.split(".tistory.com")[0].split("//")[-1]

    # Step 1: "완료" 버튼 클릭 → 발행 설정 레이어 열기
    open_btn = await page.query_selector('#publish-layer-btn')
    if not open_btn:
        open_btn = await page.query_selector('button:has-text("완료")')
    if not open_btn:
        await capture_debug(page, f"tistory_no_publish_btn_{account_name}")
        return {"success": False, "error": "완료 버튼을 찾을 수 없습니다."}

    await open_btn.click()
    logger.info(f"[{account_name}] '완료' 버튼 클릭 → 발행 레이어 대기")
    await random_delay(2, 3)

    # 발행 레이어가 열린 후 디버그 스크린샷
    await capture_debug(page, f"tistory_publish_layer_{account_name}")

    # Step 2: "공개" 라디오 버튼 선택 (기본값이 "비공개"이므로 변경 필요)
    try:
        public_clicked = await page.evaluate("""() => {
            // 라디오 버튼 또는 레이블에서 "공개" 찾기 (단, "비공개"/"공개(보호)" 제외)
            const labels = document.querySelectorAll('label, span, input[type="radio"]');
            for (const el of labels) {
                const text = el.textContent.trim();
                // 정확히 "공개"만 매칭 (비공개, 공개(보호) 제외)
                if (text === '공개') {
                    el.click();
                    return 'label';
                }
            }
            // input[value="0"] 또는 input[value="public"] 시도
            const radios = document.querySelectorAll('input[type="radio"]');
            for (const r of radios) {
                if (r.value === '0' || r.value === 'public' || r.value === '20') {
                    r.click();
                    return 'radio';
                }
            }
            return null;
        }""")
        if public_clicked:
            logger.info(f"[{account_name}] '공개' 선택 완료 (via {public_clicked})")
            await random_delay(1, 2)
        else:
            logger.warning(f"[{account_name}] '공개' 라디오 버튼을 찾지 못함")
    except Exception as e:
        logger.warning(f"[{account_name}] 공개 선택 실패: {e}")

    # 공개 선택 후 디버그
    await capture_debug(page, f"tistory_after_public_{account_name}")

    # Step 3: "공개발행" 버튼 클릭
    clicked = False
    confirm_selectors = [
        'button:has-text("공개발행")',
        'button:has-text("공개 발행")',
        'button:has-text("발행")',
        '#publish-btn',
        'button.btn-publish',
        'button.btn_ok',
    ]
    for csol in confirm_selectors:
        try:
            cbtn = await page.query_selector(csol)
            if cbtn and await cbtn.is_visible():
                btn_id = await cbtn.get_attribute("id") or ""
                btn_text = (await cbtn.text_content() or "").strip()
                if btn_id == "publish-layer-btn":
                    continue
                if btn_text in ("비공개 저장", "취소"):
                    continue
                await cbtn.click()
                logger.info(f"[{account_name}] 발행 클릭: {csol} (text='{btn_text}')")
                clicked = True
                await random_delay(3, 5)
                break
        except Exception:
            continue

    if not clicked:
        try:
            clicked = await page.evaluate("""() => {
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    const text = btn.textContent.trim();
                    if ((text === '공개발행' || text === '공개 발행' || text === '발행')
                        && btn.id !== 'publish-layer-btn') {
                        btn.click();
                        return true;
                    }
                }
                return false;
            }""")
            if clicked:
                logger.info(f"[{account_name}] JS로 공개발행 버튼 클릭 성공")
                await random_delay(3, 5)
        except Exception as e:
            logger.warning(f"[{account_name}] JS 발행 클릭 실패: {e}")

    if not clicked:
        await capture_debug(page, f"tistory_publish_fail_{account_name}")
        return {"success": False, "error": "발행 확인 버튼을 찾을 수 없습니다."}

    # Step 3: 발행 후 디버그 + URL 추출
    await capture_debug(page, f"tistory_after_publish_{account_name}")
    current_url = page.url

    if "/manage/newpost" not in current_url and "/manage/write" not in current_url:
        return {"success": True, "url": current_url}

    # URL이 아직 에디터면 → 글 목록에서 최신 글 URL 추출
    try:
        await page.goto(
            f"https://{blog_name}.tistory.com/manage/posts",
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

    return {"success": False, "error": "발행 후 URL 확인 실패 (실제 발행 미확인)"}
