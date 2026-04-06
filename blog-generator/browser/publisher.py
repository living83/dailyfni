"""
publisher.py — 네이버 블로그 발행 엔진
GitHub 검증 코드(blog_publisher.py + se_helpers.py) 패턴 기반
"""

import asyncio
import html as html_module
import json
import random
import re
from loguru import logger
from playwright.async_api import async_playwright

from browser.se_helpers import (
    _get_proxy_for_account,
    create_stealth_context,
    login,
    random_delay,
    try_selectors,
    capture_debug,
)
from config import settings
from ai.image_generator import generate_image_with_gemini



# ─────────────────────────────────────────────────────────────
# HTML → Plain Text 변환
# ─────────────────────────────────────────────────────────────

def _html_to_text(html_content: str) -> str:
    """
    HTML 콘텐츠를 SE 에디터용 plain text로 변환.
    취소선/밑줄/색상 등 텍스트 효과 태그는 내용만 남기고 태그 제거.
    """
    if not html_content or "<" not in html_content:
        return html_content  # 이미 plain text

    text = html_content

    # ❌ 에디터 텍스트 효과 태그 → 내용만 남기고 태그 상자 제거
    # (취소선, 밑줄, 기울임, 색상, 강조 등 절대 에디터에 삽입 불가)
    for tag in ('s', 'del', 'strike', 'u', 'ins', 'em', 'i', 'mark',
                'strong', 'b', 'font', 'span'):
        text = re.sub(rf'<{tag}[^>]*>', '', text, flags=re.IGNORECASE)
        text = re.sub(rf'</{tag}>', '', text, flags=re.IGNORECASE)

    # 소제목 태그 → ## 마크다운 접두사
    text = re.sub(
        r"<h[1-3][^>]*>(.*?)</h[1-3]>",
        lambda m: f"\n## {re.sub('<[^>]+>', '', m.group(1)).strip()}\n",
        text, flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"<h[4-6][^>]*>(.*?)</h[4-6]>",
        lambda m: f"\n# {re.sub('<[^>]+>', '', m.group(1)).strip()}\n",
        text, flags=re.IGNORECASE | re.DOTALL,
    )

    # </p> → 단락 구분 (빈 줄)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.IGNORECASE)
    # <p ...> → 제거
    text = re.sub(r"<p[^>]*>", "", text, flags=re.IGNORECASE)

    # <br> → 단일 줄바꿈
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)

    # <li> → 목록 기호
    text = re.sub(r"<li[^>]*>(.*?)</li>", r"- \1\n", text, flags=re.IGNORECASE | re.DOTALL)

    # 나머지 HTML 태그 제거
    text = re.sub(r"<[^>]+>", "", text)

    # HTML 엔티티 디코딩 (&amp; → &, &nbsp; → 공백 등)
    text = html_module.unescape(text)
    text = text.replace("\xa0", " ")  # non-breaking space

    # 연속 빈 줄 정리 (3개 이상 → 2개)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    return text


# ─────────────────────────────────────────────────────────────
# 내부 헬퍼
# ─────────────────────────────────────────────────────────────

async def _dismiss_all_overlays(page, editor):
    """팝업/도움말 등 차단 오버레이 닫기"""
    for sel in ['button:has-text("닫기")', 'button[class*="close"]', ".layer_close", ".btn_close"]:
        try:
            el = await page.query_selector(sel)
            if el and await el.is_visible():
                await el.click()
                await asyncio.sleep(0.3)
        except Exception:
            pass


async def _dismiss_draft_popup(page):
    """
    '작성 중인 글이 있습니다' 임시저장 팝업 처리.
    새 글을 처음부터 작성하므로 '취소'를 눌러 draft 불러오기를 거부합니다.
    """
    # 팝업이 나타날 때까지 최대 5초 대기
    await asyncio.sleep(1.5)

    # 모든 프레임 포함 탐색
    targets = [page] + list(page.frames)

    cancel_selectors = [
        'button:has-text("취소")',
        '.se-popup-button-cancel',
        '[class*="popup"] button:has-text("취소")',
        '[class*="dialog"] button:has-text("취소")',
        '[class*="modal"] button:has-text("취소")',
        'button[class*="cancel"]',
    ]

    for target in targets:
        for sel in cancel_selectors:
            try:
                el = await target.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    logger.info("[임시저장 팝업] '취소' 클릭 → 새 글 작성 모드")
                    await asyncio.sleep(0.8)
                    return True
            except Exception:
                continue

    logger.debug("[임시저장 팝업] 팝업 없음")
    return False




async def _navigate_to_blog_write(page, naver_id: str):
    """블로그 글쓰기 페이지로 이동 (3단계 fallback). (page, reached) 반환."""
    reached = False
    write_selectors = [
        'a[href*="/postwrite"]', 'a[href*="PostWriteForm"]',
        'a:has-text("글쓰기")', 'button:has-text("글쓰기")',
        '.btn_write', 'a.link_write', '#writePostBtn',
    ]

    # 방법 A: blog.naver.com 메인 → 글쓰기 버튼
    logger.info(f"글쓰기 이동 시작 (현재: {page.url})")
    if "blog.naver.com" not in page.url:
        await page.goto("https://blog.naver.com", wait_until="domcontentloaded", timeout=20000)
        await random_delay(2, 3)

    write_btn = await try_selectors(page, write_selectors, timeout=5000)
    if not write_btn:
        # 방법 B: 내 블로그 페이지
        blog_url = f"https://blog.naver.com/{naver_id}"
        logger.info(f"글쓰기 버튼 없음 → 내 블로그 이동: {blog_url}")
        await page.goto(blog_url, wait_until="domcontentloaded", timeout=20000)
        await random_delay(2, 3)
        if "페이지 주소를 확인" not in await page.content():
            write_btn = await try_selectors(page, write_selectors, timeout=5000)

    if write_btn:
        logger.info("글쓰기 버튼 발견 → 클릭")
        old_page = page
        try:
            async with page.context.expect_page(timeout=10000) as new_page_info:
                await write_btn.click()
            new_page = await new_page_info.value
            await new_page.wait_for_load_state("domcontentloaded")
            page = new_page
            # 기존 탭(blog 메인) 닫기 — 창이 2개 열리는 문제 방지
            try:
                if not old_page.is_closed():
                    await old_page.close()
            except Exception:
                pass
            logger.info(f"새 탭에서 글쓰기 열림: {page.url}")
        except Exception:
            await page.wait_for_load_state("domcontentloaded")
            logger.info(f"같은 탭 글쓰기 로드: {page.url}")
        await random_delay(3, 5)
        if "페이지 주소를 확인" not in await page.content():
            reached = True

    # 방법 C: 직접 URL
    if not reached:
        for write_url in [
            f"https://blog.naver.com/{naver_id}/postwrite",
            f"https://blog.naver.com/PostWriteForm.naver?blogId={naver_id}",
            "https://blog.naver.com/PostWriteForm.naver",
        ]:
            try:
                await page.goto(write_url, wait_until="domcontentloaded", timeout=20000)
                await random_delay(3, 5)
                content = await page.content()
                if "페이지 주소를 확인" in content or "페이지를 찾을 수 없" in content:
                    continue
                reached = True
                logger.info(f"글쓰기 페이지 도달 (직접 URL): {page.url}")
                break
            except Exception as e:
                logger.warning(f"URL 이동 실패: {write_url} - {e}")

    # 글쓰기 페이지 도달 후 임시저장 팝업 처리
    if reached:
        await _dismiss_draft_popup(page)

    return page, reached


async def _detect_editor(page):
    """SE ONE 에디터 iframe 감지. (editor, is_frame) 반환."""
    # iframe 이름으로 탐색
    for frame_id in ("mainFrame", "se_editFrame", "editor_frame"):
        try:
            frame_el = await page.wait_for_selector(
                f"iframe#{frame_id}, iframe[name='{frame_id}']", timeout=3000
            )
            if frame_el:
                frame = await frame_el.content_frame()
                if frame:
                    logger.info(f"에디터 iframe 발견: {frame_id}")
                    await random_delay(1, 2)
                    return frame, True
        except Exception:
            continue

    # contenteditable 있는 frame 탐색
    for frame in page.frames:
        try:
            el = await frame.query_selector('[contenteditable="true"]')
            if el:
                logger.info(f"contenteditable frame 발견: {frame.url[:60]}")
                return frame, True
        except Exception:
            continue

    logger.warning("iframe 미발견 → main_frame 사용")
    return page.main_frame, False


async def _dismiss_popups(page, editor):
    """에디터 진입 시 팝업 처리"""
    for sel in [
        '.se-popup-button-close', 'button[aria-label="닫기"]',
        '.btn_close', 'button:has-text("닫기")', 'button:has-text("확인")',
    ]:
        try:
            el = await editor.query_selector(sel)
            if el and await el.is_visible():
                await el.click()
                await asyncio.sleep(0.3)
        except Exception:
            pass


async def _disable_spellcheck(page, editor):
    """
    네이버 SE 에디터의 맞춤법 검사를 비활성화.
    빨간/파란 밑줄 하이라이팅이 뜨면 텍스트 입력 흐름이 깨질 수 있음.
    """
    try:
        # JS로 spellcheck 속성 제거
        await page.evaluate("""
            () => {
                // 모든 contenteditable 요소의 spellcheck 비활성화
                document.querySelectorAll('[contenteditable]').forEach(el => {
                    el.setAttribute('spellcheck', 'false');
                });
                // 맞춤법 검사 오버레이/하이라이트 제거
                document.querySelectorAll(
                    '.se-spellchecker, [class*="spellcheck"], [class*="spell_check"]'
                ).forEach(el => el.remove());
            }
        """)
        logger.info("맞춤법 검사 비활성화 완료")
    except Exception as e:
        logger.debug(f"맞춤법 검사 비활성화 시도 중 예외 (무시): {e}")

    # 맞춤법 툴바 버튼이 활성화 상태면 클릭해서 끄기
    try:
        targets = [editor, page] if editor != page.main_frame else [page]
        for target in targets:
            spell_btn = await target.query_selector(
                'button[aria-label*="맞춤법"], button[class*="spell"], button:has-text("맞춤법")'
            )
            if spell_btn:
                btn_class = await spell_btn.get_attribute('class') or ''
                aria_pressed = await spell_btn.get_attribute('aria-pressed') or ''
                # 활성화 상태일 때만 클릭해서 끄기
                if 'active' in btn_class or 'on' in btn_class or aria_pressed == 'true':
                    await spell_btn.click()
                    await asyncio.sleep(0.3)
                    logger.info("맞춤법 검사 버튼 비활성화 클릭")
                break
    except Exception:
        pass


async def _wait_editor(page, editor):
    """에디터 로딩 대기. (요소, editor) 반환."""
    el = await try_selectors(editor, [
        ".se-component", ".se-documentTitle",
        '[contenteditable="true"]', "article", ".editor_area",
    ], timeout=20000)
    return el, editor


async def _input_title(page, editor, title: str) -> bool:
    """제목 입력 — GitHub 검증 방식: 문자별 keyboard.type()"""
    title_selectors = [
        ".se-documentTitle .se-text-paragraph",
        ".se-documentTitle [contenteditable='true']",
        ".se-section-title .se-text-paragraph",
        "[data-placeholder='제목']",
        ".se-title-text",
        ".se-ff-nanumgothic.se-fs32",
        "[contenteditable='true'][class*='title']",
    ]
    title_el = await try_selectors(editor, title_selectors, timeout=10000)

    if title_el:
        await title_el.click()
        await random_delay(0.3, 0.5)
        for char in title:
            await page.keyboard.type(char, delay=50 + random.randint(-20, 30))
        await random_delay(1, 2)
        logger.info(f"제목 입력 완료: {title[:30]}...")
        return True

    # 폴백: 첫 번째 contenteditable
    try:
        first_editable = await editor.wait_for_selector('[contenteditable="true"]', timeout=5000)
        if first_editable:
            await first_editable.click()
            await random_delay(0.3, 0.5)
        await page.keyboard.type(title, delay=50)
        await random_delay(1, 2)
        logger.info(f"제목 폴백 입력: {title[:30]}...")
        return True
    except Exception as e:
        logger.error(f"제목 입력 실패: {e}")
        return False


async def _input_body(page, editor, content: str):
    """본문 입력 — keyboard.type() 줄 단위 (소제목 볼드 처리)"""
    # HTML 콘텐츠인 경우 변환
    plain_content = _html_to_text(content)
    # 전체 텍스트에서 ~~취소선~~ 등 마크다운 효과 일괄 제거 (멀티라인 패턴 포함)
    plain_content = re.sub(r'~~(.+?)~~', r'\1', plain_content, flags=re.DOTALL)
    plain_content = re.sub(r'__(.+?)__', r'\1', plain_content, flags=re.DOTALL)
    plain_content = re.sub(r'\*\*(.+?)\*\*', r'\1', plain_content, flags=re.DOTALL)
    plain_content = plain_content.replace('~~', '').replace('__', '').replace('**', '')

    body_selectors = [
        ".se-component.se-text .se-text-paragraph",
        ".se-section-text .se-text-paragraph",
        ".se-text-paragraph",
        '[contenteditable="true"]',
    ]
    body_el = await try_selectors(editor, body_selectors, timeout=5000)
    if body_el:
        await body_el.click()
        await random_delay(0.5, 1.0)

    # ❌ Control+e(가운데 정렬) 제거 — 에디터 포맷 효과 트리거 방지
    # 기본 왼쪽 정렬 유지

    base_delay = random.randint(25, 45)
    for line in plain_content.split("\n"):
        if line.strip():
            clean = line.strip()
            delay = base_delay + random.randint(-8, 12)
            is_heading = False

            if clean.startswith("## "):
                clean = clean[3:]
                is_heading = True
            elif clean.startswith("# "):
                clean = clean[2:]
                is_heading = True
            elif clean.startswith("- "):
                clean = "• " + clean[2:]

            # ❌ 텍스트 효과 트리거 문자 완전 제거
            # ~~ 취소선, 마크다운 특수문자, 에디터 자동포맷 유발 문자
            clean = re.sub(r'~~(.+?)~~', r'\1', clean)     # ~~취소선~~ → 내용만
            clean = re.sub(r'__(.+?)__', r'\1', clean)     # __밑줄__ → 내용만
            clean = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'\1', clean)  # _기울임_ → 내용만
            clean = clean.replace("**", "")                 # **볼드** 마커 제거
            clean = clean.replace("~~", "")                 # 잔여 ~~ 제거
            clean = clean.replace("__", "")                 # 잔여 __ 제거
            # 체크박스 아이콘 등 에디터에서 특수효과로 변환되는 문자 제거
            clean = re.sub(r'[\u2705\u274c\u2714\u2716\u2611\u2612]', '', clean)  # ✅ ❌ ✔ ✖ ☑ ☒
            clean = clean.strip()

            if not clean:
                continue

            if is_heading:
                await page.keyboard.press("Control+b")
                await page.keyboard.type(clean, delay=delay)
                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
                await page.keyboard.press("Control+b")
            else:
                await page.keyboard.type(clean, delay=delay)
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

    logger.info("본문 입력 완료")


async def _insert_image_from_file(page, editor, image_path: str):
    """
    SE ONE 에디터에 이미지 파일을 업로드 방식으로 삽입.
    GitHub se_insert_image 검증 패턴 기반.
    editor(iframe) → page 순서로 파일 input 탐색.
    """
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
        ], timeout=5000)

        if not img_btn:
            logger.warning("이미지 업로드 버튼 미발견 → 이미지 삽입 건너뜀")
            return

        await img_btn.click()
        await random_delay(1, 2)

        # ── 파일 input 탐색: editor(iframe) 먼저, 없으면 page ────
        file_input = None
        for sel in ['input[type="file"][accept*="image"]', 'input[type="file"]']:
            try:
                file_input = await editor.query_selector(sel)
                if file_input:
                    logger.info(f"파일 input 발견 (editor iframe): {sel}")
                    break
            except Exception:
                continue

        if not file_input:
            for sel in ['input[type="file"][accept*="image"]', 'input[type="file"]']:
                try:
                    file_input = await page.query_selector(sel)
                    if file_input:
                        logger.info(f"파일 input 발견 (page): {sel}")
                        break
                except Exception:
                    continue

        if not file_input:
            logger.warning("파일 input 요소 미발견 (숨김 포함) → 이미지 건너뜀")
            await page.keyboard.press("Escape")
            return

        await file_input.set_input_files(image_path)
        await random_delay(3, 5)

        # 삽입 확인 버튼 (timeout 10초)
        try:
            confirm = await try_selectors(editor, [
                'button:has-text("삽입")',
                'button:has-text("확인")',
                'button:has-text("등록")',
                'button.se-popup-button-confirm',
            ], timeout=10000)
            if confirm:
                await confirm.click()
                await random_delay(2, 3)
        except Exception:
            pass

        # Enter 두 번으로 커서 본문으로 이동
        await page.keyboard.press("Enter")
        await page.keyboard.press("Enter")
        await random_delay(1, 2)
        logger.info(f"이미지 삽입 완료: {image_path}")

    except Exception as e:
        logger.warning(f"이미지 삽입 실패 (계속 진행): {e}")




async def _insert_ai_image_naver(page, editor, keyword: str):
    """
    [일반글] 네이버 에디터 내 AI 이미지 생성 버튼 클릭 →
    키워드 기반 프롬프트 입력 → 생성 → 삽입.
    """
    try:
        ai_btn_selectors = [
            'button[data-name="aiImage"]',
            'button[data-name="ai_image"]',
            '.se-toolbar button[aria-label*="AI"]',
            '.se-toolbar button[aria-label*="ai"]',
            '.se-toolbar button[aria-label*="AI 이미지"]',
            '.se-toolbar-item-aiImage button',
            'button[class*="aiImage"]',
            'button[class*="ai_image"]',
        ]
        targets = [editor, page] if editor != page.main_frame else [page]

        ai_btn = None
        for target in targets:
            ai_btn = await try_selectors(target, ai_btn_selectors, timeout=3000)
            if ai_btn:
                break

        # JS 폴백: 툴바에서 'AI' 텍스트 포함 버튼
        if not ai_btn:
            for target in targets:
                try:
                    handle = await target.evaluate_handle("""() => {
                        const btns = document.querySelectorAll('.se-toolbar button, [class*="toolbar"] button');
                        for (const btn of btns) {
                            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                            const name = (btn.dataset.name || '').toLowerCase();
                            const title = (btn.title || '').toLowerCase();
                            if (label.includes('ai') || name.includes('ai') || title.includes('ai')) {
                                return btn;
                            }
                        }
                        return null;
                    }""")
                    if handle:
                        el = handle.as_element()
                        if el:
                            ai_btn = el
                            logger.info("AI 이미지 버튼 JS 폴백 발견")
                            break
                except Exception:
                    continue

        if not ai_btn:
            logger.warning("네이버 에디터 AI 이미지 버튼 미발견 → 이미지 없이 진행")
            return

        await ai_btn.click()
        logger.info("AI 이미지 생성 버튼 클릭")
        await random_delay(2, 3)

        # 프롬프트 입력 필드 탐색
        prompt_input = None
        for target in targets:
            prompt_input = await try_selectors(target, [
                'input[placeholder*="프롬프트"]',
                'input[placeholder*="prompt"]',
                'textarea[placeholder*="프롬프트"]',
                'textarea[placeholder*="입력"]',
                '.se-ai-image input',
                '.se-ai-prompt input',
                '.se-popup input[type="text"]',
            ], timeout=5000)
            if prompt_input:
                break

        if prompt_input:
            await prompt_input.click()
            await prompt_input.fill(f"{keyword} 관련 블로그 대표 이미지, 밝고 친근한 분위기")
            await random_delay(0.5, 1.0)

            # 생성 버튼 클릭
            gen_btn = None
            for target in targets:
                gen_btn = await try_selectors(target, [
                    'button:has-text("생성")',
                    'button:has-text("만들기")',
                    'button:has-text("Generate")',
                    '.se-ai-image button[class*="generate"]',
                    '.se-ai-image button[class*="create"]',
                ], timeout=3000)
                if gen_btn:
                    break

            if gen_btn:
                await gen_btn.click()
                logger.info("AI 이미지 생성 요청")
                # 이미지 생성 대기 (최대 30초)
                await random_delay(8, 12)

                # 삽입 버튼 클릭
                insert_btn = None
                for target in targets:
                    insert_btn = await try_selectors(target, [
                        'button:has-text("삽입")',
                        'button:has-text("사용")',
                        'button:has-text("확인")',
                        '.se-ai-image button[class*="insert"]',
                        '.se-ai-image button[class*="confirm"]',
                    ], timeout=10000)
                    if insert_btn:
                        break

                if insert_btn:
                    await insert_btn.click()
                    logger.info("AI 이미지 삽입 완료")
                    await random_delay(2, 3)
                else:
                    logger.warning("AI 이미지 삽입 버튼 미발견 → Escape")
                    await page.keyboard.press("Escape")
            else:
                logger.warning("AI 이미지 생성 버튼 미발견 → Escape")
                await page.keyboard.press("Escape")
        else:
            # 프롬프트 없이 바로 생성 UI인 경우 → 취소
            logger.warning("AI 이미지 프롬프트 입력 필드 미발견 → Escape")
            await page.keyboard.press("Escape")

    except Exception as e:
        logger.warning(f"AI 이미지 생성 실패 (계속 진행): {e}")
        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass




async def _input_tags(page, editor, tags: list):
    """태그 입력"""
    if not tags:
        return

    try:
        await page.keyboard.press("Control+End")
        await random_delay(0.5, 1.0)
    except Exception:
        pass

    await _dismiss_all_overlays(page, editor)

    tag_selectors = [
        'input[placeholder*="태그"]', 'input[placeholder*="태그 입력"]',
        '.se-tag-input input', '.tag_inner input',
        'input[class*="tag"]', '.tag_area input',
        '.se-tag input', '.se-section-tag input',
    ]
    tag_input = await try_selectors(editor, tag_selectors, timeout=3000)
    if not tag_input and editor != page.main_frame:
        tag_input = await try_selectors(page, tag_selectors, timeout=3000)

    if tag_input:
        await tag_input.click()
        await random_delay(0.3, 0.5)
        for tag in tags[:10]:
            await page.keyboard.type(tag, delay=40)
            await page.keyboard.press("Enter")
            await random_delay(0.3, 0.5)
        logger.info(f"태그 {min(len(tags), 10)}개 입력 완료")
    else:
        logger.warning("태그 입력 필드 미발견 → 건너뜀")


async def _click_publish(page, editor) -> bool:
    """
    발행 버튼 클릭 + 발행 설정 패널의 '✓ 발행' 버튼 클릭.
    네이버 블로그 SE 에디터는 팝업이 아닌 우측 슬라이드 패널로 발행 설정을 표시.
    """
    await random_delay(0.5, 1.0)

    # ── Step 0: 라이브러리/사이드 패널 닫기 (딜레이 원인 제거) ──
    try:
        await page.evaluate("""() => {
            const closeSels = [
                '.se-library .btn_close', '.se-library button[class*="close"]',
                '[class*="library"] button[class*="close"]',
                '[class*="library"] button[aria-label*="닫기"]',
                '.se-library-close', '.se-panel-close', 'button[class*="panel_close"]',
            ];
            for (const sel of closeSels) {
                const el = document.querySelector(sel);
                if (el && el.offsetParent !== null) { el.click(); break; }
            }
        }""")
        await asyncio.sleep(0.5)
    except Exception:
        pass

    targets = [editor, page] if editor != page.main_frame else [page]

    # ── Step 1: 툴바 '발행' 버튼 클릭 (설정 패널 열기) ──
    publish_btn = None

    # 툴바 영역의 발행 버튼 — 우측 상단에 있는 초록색 버튼
    for target in targets:
        publish_btn = await try_selectors(target, [
            'button:has-text("발행")',
            'button[class*="publish"]',
            'button[class*="btn_publish"]',
            '.publish_btn',
        ], timeout=5000)
        if publish_btn:
            break

    if not publish_btn:
        # JS 폴백: 툴바 내 발행 버튼
        for target in targets:
            try:
                clicked = await target.evaluate("""() => {
                    const btns = document.querySelectorAll('button');
                    for (const btn of btns) {
                        const t = (btn.textContent || '').trim();
                        if ((t === '발행' || t === '공개발행') && btn.offsetParent !== null) {
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                }""")
                if clicked:
                    logger.info("발행 버튼 JS 클릭 성공")
                    break
            except Exception:
                continue
        else:
            await capture_debug(page, "publish_btn_not_found")
            return False
    else:
        await publish_btn.click(force=True)

    logger.info("툴바 발행 버튼 클릭 → 발행 설정 패널 열림 대기")
    # 설정 패널 애니메이션 대기 (슬라이드인)
    await asyncio.sleep(2.5)

    # ── Step 2: 설정 패널의 '✓ 발행' 버튼 클릭 ──
    # 스크린샷 기준: 발행 설정 패널 우측 하단에 '✓ 발행' 버튼이 있음
    confirm_clicked = False

    # 2-A: Playwright 셀렉터 시도 (페이지 레벨) — 더 많은 선택자 추가
    confirm_selectors = [
        # 발행 설정 패널 내 '✓ 발행' 버튼 (스크린샷 기준 하단 오른쪽)
        '.layer_post_setting button:has-text("발행")',
        '.se-publish-settings button:has-text("발행")',
        '[class*="post_setting"] button:has-text("발행")',
        '[class*="publish_setting"] button:has-text("발행")',
        '[class*="setting_layer"] button:has-text("발행")',
        '[class*="publish"] button:has-text("발행")',
        # 체크마크 포함 버튼
        'button:has-text("✓ 발행")',
        'button:has-text("✔ 발행")',
        # 에디터 확인 버튼
        '.se-popup-publish-btn',
        'button.se-popup-button-confirm',
        'button:has-text("공개 발행")',
        'button:has-text("발행하기")',
    ]
    for sel in confirm_selectors:
        try:
            el = await page.query_selector(sel)
            if el and await el.is_visible():
                await el.click(force=True)
                confirm_clicked = True
                logger.info(f"발행 설정 패널 '발행' 버튼 클릭: {sel}")
                break
        except Exception:
            continue

    # 2-B: JS 정밀 탐색 — toolbar 영역 제외하고 '발행' 텍스트 버튼 찾기
    # 스크린샷 기준: 패널 최하단 오른쪽에 '✓ 발행' 버튼이 위치
    if not confirm_clicked:
        for target in targets:
            try:
                result = await target.evaluate("""() => {
                    // toolbar/헤더 영역의 버튼은 제외
                    const toolbarEls = document.querySelectorAll(
                        '.se-toolbar, header, .blog_post_header, #headerArea, .blog_menu'
                    );
                    const toolbarSet = new Set();
                    toolbarEls.forEach(el => {
                        el.querySelectorAll('button').forEach(b => toolbarSet.add(b));
                    });

                    // 화면에 보이는 버튼 중 toolbar 제외하고 '발행' 텍스트 있는 것
                    // 우측/하단에 위치한 버튼 우선 (발행 설정 패널)
                    const allBtns = Array.from(document.querySelectorAll('button'));
                    const candidates = [];
                    for (const btn of allBtns) {
                        if (toolbarSet.has(btn)) continue;
                        if (btn.offsetParent === null) continue;
                        const t = (btn.textContent || '').replace(/\\s+/g, '').trim();
                        if (t.includes('발행') || t.includes('공개발행') || t.includes('발행하기')) {
                            candidates.push(btn);
                        }
                    }
                    // 최하단/최우측 버튼부터 클릭 (발행 패널 버튼)
                    candidates.sort((a, b) => {
                        const ra = a.getBoundingClientRect();
                        const rb = b.getBoundingClientRect();
                        return (rb.bottom - ra.bottom) || (rb.right - ra.right);
                    });
                    if (candidates.length > 0) {
                        candidates[0].click();
                        return 'panel_confirm_btn: ' + candidates[0].textContent.trim();
                    }
                    return null;
                }""")
                if result:
                    confirm_clicked = True
                    logger.info(f"발행 설정 패널 JS 탐색 성공: {result}")
                    break
            except Exception:
                continue

    # 2-C: 좌표 기반 클릭 폴백 — 발행 패널 '✓ 발행' 버튼 위치 추정
    # 스크린샷 기준: 패널 우측 하단 고정 위치
    if not confirm_clicked:
        try:
            viewport = page.viewport_size
            if viewport:
                # 발행 설정 패널은 우측에 슬라이드 형태로 열림
                # '✓ 발행' 버튼은 패널 하단 우측에 위치
                click_x = int(viewport['width'] * 0.92)  # 우측 8% 지점
                click_y = int(viewport['height'] * 0.80)  # 하단 80% 지점
                await page.mouse.click(click_x, click_y)
                logger.info(f"발행 버튼 좌표 클릭 시도: ({click_x}, {click_y})")
                confirm_clicked = True
                await asyncio.sleep(1.0)
        except Exception as e:
            logger.warning(f"좌표 클릭 실패: {e}")

    if not confirm_clicked:
        logger.warning("발행 설정 패널 확인 버튼 미발견 → Enter 대체")
        await page.keyboard.press("Enter")

    return True



async def _verify_publish(page, pre_url: str) -> dict:
    """발행 후 URL 검증"""
    await random_delay(3, 5)

    def is_published_url(url: str) -> bool:
        if "PostView" in url or "postView" in url:
            return True
        if "blog.naver.com" in url and "Write" not in url and "PostWrite" not in url and url != pre_url:
            return True
        return False

    current_url = page.url
    for p in page.context.pages:
        if is_published_url(p.url):
            logger.info(f"발행 성공 (다른 탭): {p.url}")
            return {"success": True, "url": p.url, "error": ""}

    if is_published_url(current_url):
        logger.info(f"발행 성공: {current_url}")
        return {"success": True, "url": current_url, "error": ""}

    if "Write" in current_url or current_url == pre_url:
        try:
            await page.wait_for_url(
                lambda url: is_published_url(url),
                timeout=15000,
            )
            logger.info(f"발행 성공 (대기 후): {page.url}")
            return {"success": True, "url": page.url, "error": ""}
        except Exception:
            try:
                # 타임아웃 났는데 발행은 된 경우 (팝업 등으로 안내하는 경우 대비)
                content = await page.content()
                if "발행이 완료" in content or "내 블로그 바로가기" in content or "글이 등록" in content:
                    logger.info("팝업 텍스트로 발행 성공 감지")
                    return {"success": True, "url": page.url, "error": ""}
            except Exception:
                pass

            await capture_debug(page, "publish_not_navigated")
            return {"success": False, "url": "", "error": f"발행 후 페이지 이동 없음 ({current_url})"}

    logger.info(f"발행 성공 (기본 fallback): {current_url}")
    return {"success": True, "url": current_url, "error": ""}


# ─────────────────────────────────────────────────────────────
# 메인 발행 함수
# ─────────────────────────────────────────────────────────────

async def publish_single_post(account: dict, post_data: dict) -> dict:
    """단일 계정에 로그인하여 준비된 원고를 발행합니다."""
    account_id = account["id"]
    result = {"success": False, "url": None, "error": None}

    proxy = await _get_proxy_for_account(account_id)
    headless = settings.HEADLESS
    if not headless:
        logger.info(f"[{account['account_name']}] HEADLESS=False — 브라우저 창 표시")


    async with async_playwright() as p:
        browser, context = await create_stealth_context(p, proxy=proxy, headless=headless)
        try:
            # ── 1. 로그인 ──────────────────────────────────────────
            page = await context.new_page()
            await page.goto("https://www.naver.com/", timeout=30000)
            await page.wait_for_load_state("domcontentloaded")

            ok = await login(
                context,
                naver_id=account["naver_id"],
                naver_password=account["naver_password"],
                account_id=account_id,
            )
            if not ok:
                result["error"] = "로그인 실패"
                await page.close()
                return result

            logger.info(f"[{account['account_name']}] 로그인 성공 ✅")

            # ── 2. 글쓰기 페이지 이동 ────────────────────────────
            naver_id = account["naver_id"]
            page, reached = await _navigate_to_blog_write(page, naver_id)
            if not reached:
                result["error"] = "글쓰기 페이지 도달 실패"
                await capture_debug(page, f"write_page_fail_{account_id}")
                await page.close()
                return result

            logger.info(f"[{account['account_name']}] 글쓰기 페이지 도달: {page.url}")

            # ── 3. 에디터 iframe 감지 ────────────────────────────
            await random_delay(2, 4)
            # 임시저장 팝업이 에디터 감지 전 뜨는 경우 한 번 더 처리
            await _dismiss_draft_popup(page)
            await random_delay(0.5, 1.0)

            editor, _ = await _detect_editor(page)
            editor_el, editor = await _wait_editor(page, editor)

            if not editor_el:
                result["error"] = "에디터 로딩 실패"
                await capture_debug(page, f"editor_fail_{account_id}")
                return result

            await random_delay(1, 2)
            await _dismiss_popups(page, editor)

            # 맞춤법 검사 비활성화 (빨간/파란 밑줄 하이라이팅 방지)
            await _disable_spellcheck(page, editor)
            await random_delay(0.3, 0.5)

            pre_publish_url = page.url

            # ── 4. 제목 입력 ────────────────────────────────────
            title_ok = await _input_title(page, editor, post_data.get("title", "제목 없음"))
            if not title_ok:
                result["error"] = "제목 입력 실패"
                await capture_debug(page, f"title_fail_{account_id}")
                return result

            # 본문 영역으로 포커스 이동
            await page.keyboard.press("Tab")
            await random_delay(1, 2)

            # ── 5. 대표이미지 삽입 (제목 입력 직후, 본문 전) ──────
            post_type = post_data.get("post_type", "general")
            is_ad_post = (post_type == "ad")
            target_keyword = post_data.get("keyword", post_data.get("title", "")[:20])

            # 광고글 / 일반글 모두 Gemini로 대표이미지 생성 시도
            # (네이버 AI 이미지 버튼은 자동화 탐지로 불안정 → Gemini로 통일)
            logger.info(f"[{'광고' if is_ad_post else '일반'}글] Gemini 대표이미지 생성 중: '{target_keyword}'")
            img_path = await generate_image_with_gemini(target_keyword, is_ad=is_ad_post)
            if img_path:
                await _insert_image_from_file(page, editor, img_path)
                logger.info(f"대표이미지 삽입 완료: {img_path}")
            else:
                # Gemini 실패 시 일반글만 네이버 AI 버튼으로 fallback
                if not is_ad_post:
                    logger.warning("Gemini 이미지 실패 → 네이버 AI 이미지 버튼으로 fallback")
                    await _insert_ai_image_naver(page, editor, target_keyword)
                else:
                    logger.warning("[광고글] Gemini 이미지 생성 실패 → 이미지 없이 진행")
            await random_delay(1, 2)

            # ── 6. 본문 입력 (HTML → 텍스트 자동 변환) ──────────
            content = post_data.get("content", "")
            if content:
                await _input_body(page, editor, content)
                await random_delay(1, 2)



            # ── 7. 태그 입력 ─────────────────────────────────────
            tags_raw = post_data.get("keywords")
            if tags_raw:
                tag_list = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
                await _input_tags(page, editor, tag_list)
                await random_delay(0.5, 1.0)

            # ── 8. 발행 ──────────────────────────────────────────
            publish_ok = await _click_publish(page, editor)
            if not publish_ok:
                result["error"] = "발행 버튼 클릭 실패"
                return result

            # ── 9. 발행 결과 검증 ────────────────────────────────
            verify = await _verify_publish(page, pre_publish_url)
            result.update(verify)

            if result["success"]:
                logger.info(f"✨ [{account['account_name']}] 발행 성공! {result['url']}")
            else:
                logger.error(f"[{account['account_name']}] 발행 실패: {result['error']}")
                await capture_debug(page, f"publish_fail_{account_id}")

        except Exception as e:
            logger.error(f"[{account['account_name']}] 발행 예외: {e}")
            result["error"] = str(e)

        finally:
            try:
                await context.close()
                await browser.close()
            except Exception:
                pass

    return result
