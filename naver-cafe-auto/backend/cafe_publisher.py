"""
cafe_publisher.py - 네이버 카페 자동 발행 (Playwright 기반)

흐름:
1. 로그인: se_helpers.py 의 login() 재사용 (쿠키/ID-PW)
2. 카페 이동: cafe.naver.com/{카페URL} 접속
3. 글쓰기 버튼 클릭 (게시판 자동 이동) / 또는 메뉴 ID 다이렉트 URL 조합 접속
4. SE ONE 에디터 로드 후 제목, 본문 작성
5. 발행 버튼 클릭
"""

import asyncio
import json
import os
import random
import re
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Dict, Any

from loguru import logger
from playwright.async_api import async_playwright, Page, Frame, BrowserContext

from se_helpers import (
    create_stealth_context,
    login,
    random_delay,
    try_selectors,
    capture_debug,
    _get_proxy_for_account,
)
from crypto import decrypt_password


# -----------------------------------------------------------------------------
# 에디터 및 본문 처리 함수
# -----------------------------------------------------------------------------

async def _dismiss_popups(page: Page, editor: Frame | Page):
    """글쓰기 진입 시 알림/임시저장 팝업 무시"""
    popups = [
        '.se-popup-button-cancel', 'button[aria-label="닫기"]',
        '.btn_close', 'button:has-text("취소")', 'button:has-text("닫기")'
    ]
    
    # 본 프레임/서브 프레임 모두 탐색
    targets = [page]
    if editor != page: targets.append(editor)
    
    for t in targets:
        for p in popups:
            try:
                el = await t.query_selector(p)
                if el and await el.is_visible():
                    await el.click(force=True)
                    await asyncio.sleep(0.3)
            except:
                pass

async def _select_board(page: Page, editor: Frame | Page, menu_id: str, board_name: str = ""):
    """게시판 선택 — menuId 매칭 우선, 실패 시 board_name 텍스트로 폴백"""
    if not menu_id and not board_name:
        return

    try:
        target_id = str(menu_id)

        # 탐색 대상: editor(iframe) 우선, page 폴백
        # 실제 드롭다운은 cafe_main iframe 내부에 있으므로 editor를 우선 사용
        targets = [editor, page] if editor != page else [page]

        _BOARD_BTN_JS = """() => {
            var btns = document.querySelectorAll('button, a.select_component, .select_component');
            for (var i = 0; i < btns.length; i++) {
                var txt = (btns[i].textContent || '').trim();
                if (txt.indexOf('게시판') >= 0 || txt.indexOf('선택') >= 0) {
                    return btns[i];
                }
            }
            return null;
        }"""

        board_btn_el = None
        found_in = None

        # 1. 각 target(iframe → page 순)에서 게시판 선택 버튼 탐색
        for target in targets:
            # JS evaluate_handle로 탐색
            try:
                handle = await target.evaluate_handle(_BOARD_BTN_JS)
                if handle and await handle.evaluate("el => el !== null"):
                    el = handle.as_element()
                    if el:
                        board_btn_el = el
                        found_in = target
                        break
            except:
                pass

            if board_btn_el:
                break

            # CSS 셀렉터 폴백
            board_selectors = [
                "button.select_component",
                ".board_select button",
                "select.select_component",
                "button[class*='Board']",
                "button[class*='board']",
                ".select_area button",
            ]
            for sel in board_selectors:
                try:
                    el = await target.query_selector(sel)
                    if el:
                        txt = (await el.inner_text()).strip()
                        if "선택" in txt or "게시판" in txt:
                            board_btn_el = el
                            found_in = target
                            break
                except:
                    continue
            if board_btn_el:
                break

        if not board_btn_el:
            logger.info("게시판 선택 버튼 없음 (URL menuId로 이미 지정됨 또는 미노출)")
            return

        btn_text = ""
        try:
            btn_text = (await board_btn_el.inner_text()).strip()
        except:
            pass

        if "선택" not in btn_text and "게시판" not in btn_text:
            logger.info(f"게시판 이미 선택됨: '{btn_text}'")
            return

        logger.warning(f"게시판 미선택 감지: '{btn_text}' → 드롭다운 클릭 (target={target_id}, ctx={'iframe' if found_in != page else 'page'})")

        # 2. 드롭다운 클릭
        try:
            await board_btn_el.click()
        except:
            try:
                await found_in.evaluate("el => el.click()", board_btn_el)
            except:
                pass
        await random_delay(0.8, 1.2)

        # 3. 드롭다운 항목 덤프 + menuId 매칭
        _DUMP_JS = """() => {
            var allULs = document.querySelectorAll('ul');
            var result = [];
            for (var u = 0; u < allULs.length; u++) {
                var ul = allULs[u];
                var rect = ul.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                var style = window.getComputedStyle(ul);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                if (ul.closest('.cafe-menu, .gnb, #menuList, .sidebar, nav')) continue;
                if (ul.classList.contains('gnb_lst') || ul.classList.contains('se-toolbar')) continue;
                var items = ul.querySelectorAll(':scope > li');
                if (items.length < 1) continue;
                for (var j = 0; j < items.length; j++) {
                    var li = items[j];
                    var a = li.querySelector('a');
                    result.push({
                        text: (li.textContent || '').trim().slice(0, 40),
                        dataMenuid: li.getAttribute('data-menuid') || li.getAttribute('data-menu-id') || li.getAttribute('data-id') || '',
                        aHref: a ? (a.getAttribute('href') || '') : '',
                        aDataMenuid: a ? (a.getAttribute('data-menuid') || a.getAttribute('data-menu-id') || '') : '',
                        ulClass: ul.className.slice(0, 30)
                    });
                }
            }
            return result;
        }"""

        _MATCH_JS = """(targetId) => {
            var targetStr = String(targetId);
            var allULs = document.querySelectorAll('ul');
            var candidateLists = [];
            for (var u = 0; u < allULs.length; u++) {
                var ul = allULs[u];
                var rect = ul.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                var style = window.getComputedStyle(ul);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                var items = ul.querySelectorAll(':scope > li');
                if (items.length < 1) continue;
                if (ul.closest('.cafe-menu, .gnb, #menuList, .sidebar, nav')) continue;
                if (ul.classList.contains('gnb_lst') || ul.classList.contains('se-toolbar')) continue;
                var isOptionList = ul.classList.contains('option_list');
                candidateLists.push({ul: ul, items: items, isOptionList: isOptionList});
            }
            candidateLists.sort(function(a, b) {
                return (b.isOptionList ? 1 : 0) - (a.isOptionList ? 1 : 0);
            });

            function clickItem(li) {
                var btn = li.querySelector('button.option');
                if (btn) { btn.click(); return; }
                var a = li.querySelector('a');
                if (a) { a.click(); return; }
                var anyBtn = li.querySelector('button');
                if (anyBtn) { anyBtn.click(); return; }
                li.click();
            }

            for (var d = 0; d < candidateLists.length; d++) {
                var list = candidateLists[d];
                for (var j = 0; j < list.items.length; j++) {
                    var li = list.items[j];
                    var a = li.querySelector('a');
                    var menuId = li.getAttribute('data-menuid') ||
                                 li.getAttribute('data-menu-id') ||
                                 li.getAttribute('data-id') || '';
                    var href = a ? (a.getAttribute('href') || '') : '';
                    if (a) {
                        menuId = menuId || a.getAttribute('data-menuid') ||
                                 a.getAttribute('data-menu-id') || '';
                    }
                    // ID 비교: 문자열/숫자 모두 허용
                    var idMatch = menuId && (menuId === targetStr || menuId === targetId);
                    // href에 menuId 포함 여부
                    var hrefMatch = href && (
                        href.indexOf('menuId=' + targetStr) >= 0 ||
                        href.indexOf('/' + targetStr) >= 0
                    );
                    if (idMatch || hrefMatch) {
                        clickItem(li);
                        return {method: 'menuId', text: (li.textContent||'').trim()};
                    }
                }
            }
            return {method: 'none', text: ''};
        }"""

        # 드롭다운 항목 덤프 (디버깅용)
        for ctx in ([found_in] + [t for t in targets if t != found_in]):
            try:
                dump = await ctx.evaluate(_DUMP_JS)
                if dump:
                    logger.debug(f"드롭다운 항목 덤프: {dump[:8]}")  # 최대 8개만 출력
                    break
            except:
                continue

        matched = None
        # found_in(iframe or page)에서 우선 실행
        for ctx in ([found_in] + [t for t in targets if t != found_in]):
            try:
                matched = await ctx.evaluate(_MATCH_JS, target_id)
                if matched and matched.get("method") != "none":
                    break
            except:
                continue

        if matched and matched.get("method") != "none":
            logger.info(f"게시판 선택 완료 ({matched['method']}): '{matched['text']}'")
            await random_delay(0.5, 1.0)
        else:
            logger.warning(f"게시판 드롭다운에서 menuId={target_id} 항목을 찾지 못했습니다.")
            # ── 폴백: board_name 텍스트로 직접 매칭 ───────────────────────
            if board_name:
                _NAME_MATCH_JS = """(name) => {
                    var allULs = document.querySelectorAll('ul.option_list, ul');
                    var clean = function(s) { return s.replace(/\\s+/g, '').toLowerCase(); };
                    var nameCl = clean(name);
                    for (var u = 0; u < allULs.length; u++) {
                        var ul = allULs[u];
                        var rect = ul.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) continue;
                        var style = window.getComputedStyle(ul);
                        if (style.display === 'none' || style.visibility === 'hidden') continue;
                        var lis = ul.querySelectorAll(':scope > li');
                        for (var j = 0; j < lis.length; j++) {
                            var li = lis[j];
                            var liText = clean(li.textContent || '');
                            if (liText.indexOf(nameCl) >= 0 || nameCl.indexOf(liText) >= 0) {
                                var btn = li.querySelector('button.option') || li.querySelector('button') || li.querySelector('a');
                                if (btn) btn.click(); else li.click();
                                return {method: 'name_text', text: (li.textContent||'').trim()};
                            }
                        }
                    }
                    return {method: 'none', text: ''};
                }"""
                name_matched = None
                for ctx in ([found_in] + [t for t in targets if t != found_in]):
                    try:
                        name_matched = await ctx.evaluate(_NAME_MATCH_JS, board_name)
                        if name_matched and name_matched.get("method") != "none":
                            break
                    except:
                        continue
                if name_matched and name_matched.get("method") != "none":
                    logger.info(f"게시판 텍스트 매칭 완료: '{name_matched['text']}'")
                    await random_delay(0.5, 1.0)
                else:
                    logger.warning(f"게시판 텍스트 매칭도 실패: board_name='{board_name}'")

    except Exception as e:
        logger.warning(f"게시판 선택 중 오류 (무시): {e}")

async def _insert_link_card(page: Page, editor: "Frame|Page", link_url: str, link_text: str = "") -> bool:
    """
    네이버 스마트에디터에서 링크(OG 카드)를 삽입합니다.
    Ctrl+K 단축키 → URL 입력 → 돋보기(검색) → 확인 순서로 진행.
    실패하면 False 반환 (텍스트 폴백은 호출부에서 처리)
    """
    try:
        # 1. 에디터 본문 영역에 포커스 — Ctrl+K가 에디터에서 눌려야 함
        #    editor(iframe) 기준으로 클릭 가능한 본문(.se-content, [contenteditable]) 탐색
        body_selectors = [
            ".se-content", ".se-editor", "[contenteditable='true']",
            ".se-text-paragraph", ".se-module-text",
        ]
        focused = False
        for ctx in ([editor] if editor != page else [page]):
            for sel in body_selectors:
                try:
                    el = await ctx.query_selector(sel)
                    if el and await el.is_visible():
                        await el.click()
                        focused = True
                        logger.info(f"에디터 포커스: {sel}")
                        break
                except:
                    continue
            if focused:
                break

        if not focused:
            # 포커스 실패해도 Ctrl+K 시도
            logger.warning("에디터 본문 클릭 실패 — Ctrl+K 시도")

        await random_delay(0.3, 0.5)

        # 2. 링크 다이얼로그 열기 — 3가지 방법 순차 시도
        dialog_opened = False

        # 방법 A: 에디터 요소에 직접 Ctrl+K 키이벤트 dispatch
        if focused:
            for ctx in ([editor] if editor != page else [page]):
                try:
                    await ctx.evaluate("""() => {
                        const el = document.querySelector('.se-content, .se-editor, [contenteditable=true]');
                        if (!el) return;
                        el.focus();
                        el.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true}));
                    }""")
                    dialog_opened = True
                    logger.info("Ctrl+K 이벤트 dispatch 완료")
                    break
                except:
                    continue

        # 방법 B: page.keyboard 레벨 Ctrl+K 시도
        if not dialog_opened:
            await page.keyboard.press("Control+k")
            dialog_opened = True
            logger.info("page.keyboard Ctrl+K 전송")

        await random_delay(1.0, 1.5)

        # 3. URL 입력란 대기 (page, editor 순서로 탐색)
        url_input = None
        url_input_selectors = [
            "input[placeholder*='URL']",
            "input[placeholder*='url']",
            "input[type='url']",
            ".se-popup-link input[type='text']",
            ".se-link-popup input",
            ".se-popup input[type='text']",
            ".se-popup input",
        ]
        # 다이얼로그는 최상위 page 또는 editor 모두 확인
        for ctx in ([page, editor] if editor != page else [page]):
            for sel in url_input_selectors:
                try:
                    el = await ctx.wait_for_selector(sel, timeout=4000, state="visible")
                    if el:
                        url_input = el
                        logger.info(f"URL 입력란 발견: {sel}")
                        break
                except:
                    continue
            if url_input:
                break

        if not url_input:
            logger.warning("링크 다이얼로그 URL 입력란 없음 — ESC 후 폴백")
            await page.keyboard.press("Escape")
            return False

        # 4. URL 입력 (기존 내용 지우고 입력)
        await url_input.triple_click()
        await url_input.fill(link_url)
        await random_delay(0.3, 0.5)

        # 5. Enter 키로 OG 미리보기 검색 트리거 (돋보기 버튼 역할)
        await url_input.press("Enter")
        await random_delay(3.5, 5.0)  # OG 이미지 로드 대기

        # 6. 확인 버튼 클릭
        confirm_btn = None
        confirm_btn_selectors = [
            ".se-popup-button-confirm",
            ".se-popup-button-primary",
            "button:has-text('확인')",
            ".se-popup button:last-child",
        ]
        for ctx in ([page, editor] if editor != page else [page]):
            for sel in confirm_btn_selectors:
                try:
                    el = await ctx.query_selector(sel)
                    if el and await el.is_visible():
                        txt = (await el.inner_text()).strip()
                        if "취소" in txt or "닫기" in txt:
                            continue
                        confirm_btn = el
                        logger.info(f"확인 버튼 발견: {sel}, text='{txt}'")
                        break
                except:
                    continue
            if confirm_btn:
                break

        if confirm_btn:
            await confirm_btn.click()
        else:
            logger.warning("확인 버튼 없음 — Enter로 대체")
            await page.keyboard.press("Enter")

        await random_delay(0.8, 1.2)
        logger.info(f"링크 카드 삽입 완료: {link_url}")
        return True

    except Exception as e:
        logger.warning(f"링크 카드 삽입 실패: {e}")
        try:
            await page.keyboard.press("Escape")
        except:
            pass
        return False


async def _wait_editor(page: Page) -> tuple["Frame|Page", Any]:
    """SE ONE 에디터 프레임 감지"""
    for frame_id in ("cafe_main", "mainFrame", "se_editFrame"):
        try:
            fr_el = await page.wait_for_selector(f"iframe#{frame_id}, iframe[name='{frame_id}']", timeout=5000)
            if fr_el:
                frame = await fr_el.content_frame()
                if frame:
                    return frame, True
        except:
            pass
            
    return page, False


async def _find_title_element(page: Page, editor: Frame | Page):
    """제목 입력 영역 찾기 (기존 매크로의 다중 전략 적용)"""

    # 전략 1: 카페 글쓰기 textarea (최우선 — SE ONE 에디터 이전 구버전 포함)
    title_selectors = [
        "textarea.textarea_input",                           # 네이버 카페 글쓰기 textarea
        ".se-ff-system.se-fs28.se-placeholder.__se_title",
        ".__se_title",
        ".se-documentTitle .se-text-paragraph",
        ".se-title-text .se-text-paragraph",
        ".se-title .se-text-paragraph",
        ".se-section-title .se-text-paragraph",
        "span.se-ff-system.se-fs28",
        "[placeholder*='제목']",
    ]
    for target in ([editor, page] if editor != page else [page]):
        el = await try_selectors(target, title_selectors, timeout=3000)
        if el:
            return el

    # 전략 2: JS DOM 탐색 (CSS 셀렉터 실패 시)
    logger.info("제목 셀렉터 실패 → JS DOM 탐색 시도")
    for target in ([editor, page] if editor != page else [page]):
        try:
            el = await target.evaluate_handle("""() => {
                // 1. se-text-paragraph 중 제목 영역
                var paragraphs = document.querySelectorAll('.se-text-paragraph');
                for (var p of paragraphs) {
                    var parent = p.closest('.se-section-title, .se-title-text, .se-documentTitle');
                    if (parent) return p;
                }
                // 2. __se_title 클래스
                var titleEl = document.querySelector('[class*="__se_title"]');
                if (titleEl) return titleEl;
                // 3. placeholder에 '제목' 포함
                var allEls = document.querySelectorAll('[data-placeholder], [placeholder], textarea');
                for (var el of allEls) {
                    var ph = (el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '');
                    if (ph.includes('제목')) return el;
                }
                // 4. 첫 번째 se-text-paragraph
                if (paragraphs.length > 0) return paragraphs[0];
                // 5. 첫 번째 contenteditable
                var ce = document.querySelector('[contenteditable="true"]');
                if (ce) return ce;
                return null;
            }""")
            # evaluate_handle이 null이면 None 체크
            if el and await el.evaluate("el => el !== null"):
                as_el = el.as_element()
                if as_el:
                    return as_el
        except Exception as e:
            logger.warning(f"JS DOM 탐색 실패: {e}")

    return None


async def _input_title_and_body(page: Page, editor: Frame|Page, title: str, sections: list):
    """제목 및 본문을 입력하는 로직"""
    
    try:
        await page.evaluate("() => { document.querySelectorAll('[contenteditable]').forEach(e=>e.setAttribute('spellcheck', 'false')); }")
    except: pass

    # 제목 — 다중 전략으로 찾기
    t_el = await _find_title_element(page, editor)
    if not t_el:
        # 마지막 폴백: 스크린샷 찍고 예외
        try:
            pages = page.context.pages if hasattr(page, 'context') else []
            if pages:
                await capture_debug(pages[-1], "title_not_found")
        except: pass
        raise Exception("제목 영역을 찾을 수 없습니다. (모든 전략 실패)")
        
    await t_el.click()
    await random_delay(0.3, 0.5)
    
    # textarea인 경우 fill()이 더 안정적
    tag = await t_el.evaluate("el => el.tagName.toLowerCase()")
    if tag == "textarea":
        await t_el.fill(title)
    else:
        for ch in title:
            await page.keyboard.type(ch, delay=random.randint(40, 70))
        
    await random_delay(1.0, 1.5)
    
    await page.keyboard.press("Tab")
    await random_delay(0.5, 1.0)
    
    for section in sections:
        typ = section.get("type")
        if typ == "text":
            for line in section.get("lines", []):
                text = line.get("text", "")
                if line.get("style") == "empty" or not text.strip():
                    await page.keyboard.press("Enter")
                    await random_delay(0.2, 0.4)
                    continue
                
                for ch in text:
                    await page.keyboard.type(ch, delay=random.randint(20, 50))
                
                # 줄 入력 후 Enter 두 번 → 빈 줄 추가 (가독성 향상)
                await page.keyboard.press("Enter")
                await page.keyboard.press("Enter")
                await random_delay(0.3, 0.7)
                
        elif typ == "cta_table":
            link_url = section.get("link", "")
            link_text = section.get("text", "상담하러 가기")
            if link_url:
                # 링크 카드(OG 이미지 미리보기) 삽입 시도
                card_ok = await _insert_link_card(page, editor, link_url, link_text)
                if not card_ok:
                    # 카드 삽입 실패 시 텍스트 폴백
                    logger.warning("링크 카드 실패 → 텍스트로 폴백")
                    cta_txt = f"{link_text} : {link_url}"
                    await page.keyboard.type(cta_txt, delay=30)
                    await page.keyboard.press("Enter")

        # sticker 타입은 지원 안 함 (pass)

        await random_delay(0.5, 1.0)
        
    logger.info("본문 작성 완료")

async def _click_publish(page: Page, editor: Frame | Page) -> bool:
    """카페 글쓰기 등록 버튼 클릭 — 기존 매크로와 동일한 3단계 전략"""
    # 발행 전 팝업/스티커 팝업 강제 닫기
    for close_sel in ['button[aria-label="닫기"]', '.se-popup-button-cancel', '.btn_close',
                       'button.close-btn', '[class*="sticker"] button.close']:
        try:
            el = await page.query_selector(close_sel)
            if el and await el.is_visible():
                await el.click(force=True)
                await asyncio.sleep(0.3)
        except:
            pass
    
    submit_btn = None
    
    # 1단계: CSS 셀렉터 (기존 매크로 동일)
    submit_selectors = [
        "button.BaseButton--skinGreen",
        "button.BaseButton--skinRed",
        "button[class*='BaseButton--skin']",
        "button[class*='btn_publish']",
        "button[class*='publish']",
        "a[class*='btn_publish']",
        "a[class*='publish']",
    ]
    
    for t in [editor, page]:
        for sel in submit_selectors:
            try:
                candidates = await t.query_selector_all(sel)
                for btn in candidates:
                    txt = (await btn.inner_text()).strip()
                    if ("등록" in txt or "발행" in txt or "게시" in txt) and "임시" not in txt:
                        submit_btn = btn
                        logger.info(f"등록 버튼 발견 (CSS): {sel}, text={txt}")
                        break
                if submit_btn:
                    break
            except:
                continue
        if submit_btn:
            break
    
    # 2단계: Playwright locator XPATH 폴백
    if not submit_btn:
        xpath_patterns = [
            "//button[.//text()[contains(.,'등록')] and not(.//text()[contains(.,'임시')])]",
            "//a[.//text()[contains(.,'등록')] and not(.//text()[contains(.,'임시')])]",
            "//button[.//text()[contains(.,'발행')]]",
        ]
        for t in [editor, page]:
            for xp in xpath_patterns:
                try:
                    loc = t.locator(f"xpath={xp}")
                    if await loc.count() > 0:
                        submit_btn = await loc.element_handle()
                        logger.info(f"등록 버튼 발견 (XPATH): {xp}")
                        break
                except:
                    continue
            if submit_btn:
                break
    
    # 3단계: JS textContent 폴백
    if not submit_btn:
        try:
            submit_btn = await page.evaluate_handle("""() => {
                var els = document.querySelectorAll('button, a, [role="button"]');
                for (var i = 0; i < els.length; i++) {
                    var txt = (els[i].textContent || '').trim();
                    if ((txt.indexOf('등록') >= 0 || txt.indexOf('발행') >= 0) &&
                        txt.indexOf('임시') < 0 && txt.length < 10) {
                        return els[i];
                    }
                }
                return null;
            }""")
            if submit_btn:
                logger.info("등록 버튼 발견 (JS textContent)")
        except:
            submit_btn = None
    
    if not submit_btn:
        logger.error("등록 버튼을 찾을 수 없습니다.")
        return False
    
    # dialog(alert) 핸들러 등록 — 클릭 전에 먼저 등록해야 함
    dialog_msg = []
    async def _on_dialog(dialog):
        dialog_msg.append(dialog.message)
        logger.warning(f"등록 시 dialog 감지: '{dialog.message}'")
        await dialog.accept()
    page.on("dialog", _on_dialog)

    # 클릭 (JS 폴백 포함)
    try:
        await submit_btn.click()
    except Exception:
        try:
            await page.evaluate("el => el.click()", submit_btn)
        except Exception as e:
            logger.error(f"등록 버튼 클릭 실패: {e}")
            page.remove_listener("dialog", _on_dialog)
            return False
    
    await random_delay(3, 5)
    page.remove_listener("dialog", _on_dialog)

    if dialog_msg:
        logger.warning(f"등록 dialog 메시지: {dialog_msg} → 페이지 블로킹 해제됨")

    logger.info("발행 등록 요청 성공")
    return True


# -----------------------------------------------------------------------------
# 메인 프로세스
# -----------------------------------------------------------------------------

async def async_publish_to_cafe(
    account: dict,
    cafe_url: str,
    menu_id: str,
    title: str,
    sections: list,
    headless: bool = True,
    on_progress=None,
    board_name: str = "",
) -> dict:
    """
    Playwright 구조의 카페 퍼블리셔
    
    핵심 수정:
    - create_stealth_context는 (browser, context)를 반환 → 올바르게 언패킹
    - login()에 context 전달 (이전: browser를 잘못 전달)
    - page = context.new_page() 로 실제 페이지 생성
    - close 시 browser.close() 사용
    """
    result = {"success": False, "url": None, "error": None, "cookies": None}
    
    async with async_playwright() as pw:
        # 계정별 프록시 조회 (DB 잠금 시 3초 timeout)
        account_id = account.get("id")
        proxy = None
        try:
            proxy = await asyncio.wait_for(
                _get_proxy_for_account(account_id) if account_id else asyncio.sleep(0),
                timeout=3.0
            )
        except asyncio.TimeoutError:
            logger.warning("프록시 조회 타임아웃 — 직접 연결로 진행")
        except Exception as e:
            logger.warning(f"프록시 조회 실패 (무시): {e}")

        browser, context = await create_stealth_context(pw, proxy=proxy, headless=headless)

        try:
            # 1. 로그인
            logger.info("네이버 로그인 시작")
            if on_progress: on_progress("login", "로그인 진행 중...")
            
            plain_pw = decrypt_password(account["password_enc"]) if account.get("password_enc") else ""
            is_logged_in = await login(context, account["username"], plain_pw, account_id)
            if not is_logged_in:
                raise Exception("로그인에 실패했습니다. (캡차 또는 ID/PW 오류)")
                
            cookies = await context.cookies()
            result["cookies"] = json.dumps(cookies, ensure_ascii=False)
            
            page = await context.new_page()
            
            # 2. cafe.naver.com 세션 확립 (기존 매크로의 _ensure_cafe_session 동일)
            if on_progress: on_progress("navigate", "카페 세션 확립 중...")
            await page.goto("https://cafe.naver.com", wait_until="domcontentloaded", timeout=30000)
            await random_delay(2, 3)
            if "nidlogin" in page.url or "nid.naver.com" in page.url:
                raise Exception("카페 세션 확립 실패 — 로그인 페이지로 리다이렉트됨")
            logger.info("cafe.naver.com 세션 확립 완료")
            
            # 3. cafe alias 추출 및 numeric cafe ID 조회 (기존 매크로의 _resolve_numeric_cafe_id 동일)
            if on_progress: on_progress("navigate", "카페 ID 조회 중...")
            _url_val = cafe_url.strip().rstrip("/")
            if "cafe.naver.com" not in _url_val:
                _url_val = f"https://cafe.naver.com/{_url_val}"
            
            # alias 추출: cafe.naver.com/{alias} 형태에서 alias 가져오기
            _alias_m = re.search(r"cafe\.naver\.com/([^/\?]+)", _url_val)
            cafe_alias = _alias_m.group(1) if _alias_m and not _alias_m.group(1).startswith("f-e") else _url_val.split("/")[-1]
            
            # 이미 숫자면 그대로
            if cafe_alias.isdigit():
                cafe_numeric_id = cafe_alias
            else:
                # Naver API로 numeric ID 조회 (기존 매크로 방법 -1: Python HTTP)
                cafe_numeric_id = ""
                import urllib.request
                for api_url in [
                    f"https://apis.naver.com/cafe-web/cafe2/CafeGateInfo.json?cafeUrl={cafe_alias}",
                    f"https://apis.naver.com/cafe-web/cafe-mobile/CafeMobileInfo.json?cafeUrl={cafe_alias}",
                ]:
                    try:
                        req = urllib.request.Request(api_url, headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "Referer": "https://cafe.naver.com/",
                        })
                        with urllib.request.urlopen(req, timeout=10) as resp_:
                            data = json.loads(resp_.read().decode("utf-8"))
                            cid = (
                                data.get("message", {}).get("result", {}).get("cafeId")
                                or data.get("message", {}).get("result", {}).get("cafe", {}).get("id")
                            )
                            if cid and str(cid).isdigit():
                                cafe_numeric_id = str(cid)
                                logger.info(f"카페 numeric ID 조회 성공: {cafe_alias} → {cafe_numeric_id}")
                                break
                    except Exception as e:
                        logger.warning(f"Naver API 조회 실패 ({api_url}): {e}")
                
                if not cafe_numeric_id:
                    # API 실패 시 페이지 소스에서 추출 시도
                    logger.warning("API 조회 실패 → 카페 페이지 소스에서 ID 추출 시도")
                    await page.goto(f"https://cafe.naver.com/{cafe_alias}", wait_until="domcontentloaded", timeout=30000)
                    await random_delay(2, 3)
                    page_src = await page.content()
                    for pat in [r'"clubId"\s*:\s*(\d+)', r'"cafeId"\s*:\s*(\d+)', r'/cafes/(\d+)']:
                        _m = re.search(pat, page_src)
                        if _m:
                            cafe_numeric_id = _m.group(1)
                            logger.info(f"페이지 소스에서 카페 ID 추출: {cafe_numeric_id}")
                            break
            
            if not cafe_numeric_id or not cafe_numeric_id.isdigit():
                raise Exception(f"카페 numeric ID 조회 실패 (alias={cafe_alias}). 카페 URL을 확인해주세요.")
            
            # 4. 글쓰기 URL 이동 — 기존 매크로의 navigate_to_write_page와 동일
            if on_progress: on_progress("navigate", f"글쓰기 페이지 이동 중 (cafeId={cafe_numeric_id}, menuId={menu_id})")
            if menu_id:
                write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_numeric_id}/articles/write?boardType=L&menuId={menu_id}"
            else:
                write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_numeric_id}/articles/write?boardType=L"
            
            logger.info(f"글쓰기 URL: {write_url}")
            await page.goto(write_url, wait_until="domcontentloaded", timeout=30000)
            await random_delay(3, 5)
            
            # 세션 만료 체크
            if "nidlogin" in page.url or "nid.naver.com" in page.url:
                raise Exception("글쓰기 페이지 이동 중 세션 만료 — 재로그인 필요")
            
            logger.info(f"글쓰기 페이지 URL: {page.url}")
            
            # 5. cafe_main iframe 확인 및 switch (기존 매크로 동일)
            if on_progress: on_progress("write", "에디터 로딩 및 본문 작성 중...")
            
            editor = page  # 기본은 page
            try:
                frame_el = await page.wait_for_selector(
                    "iframe#cafe_main, iframe[name='cafe_main']", timeout=8000
                )
                if frame_el:
                    frame = await frame_el.content_frame()
                    if frame:
                        editor = frame
                        logger.info("cafe_main iframe 감지 → frame으로 전환")
                        await random_delay(1, 2)
            except Exception:
                logger.info("cafe_main iframe 없음 — page 직접 사용")
            
            # 에디터 JS 초기화 대기
            await random_delay(3, 5)
            
            await _dismiss_popups(page, editor)

            # 게시판 선택 확인:
            # write URL에 menuId를 포함했으므로 네이버가 이미 해당 게시판을 선택한 상태.
            # 드롭다운 버튼 텍스트를 확인해서 '게시판 선택'(미선택)인 경우에만 _select_board 호출.
            if menu_id:
                board_pre_selected = False
                for _tgt in ([editor, page] if editor != page else [page]):
                    try:
                        _btn = await _tgt.query_selector(
                            "button.select_component, .board_select button, .select_area button"
                        )
                        if _btn:
                            _txt = (await _btn.inner_text()).strip()
                            logger.info(f"게시판 버튼 텍스트: '{_txt}'")
                            if "선택" not in _txt and "게시판" not in _txt:
                                # 이미 특정 게시판이 선택된 상태
                                board_pre_selected = True
                                logger.info(f"게시판 URL menuId 적용 확인: '{_txt}' (menu_id={menu_id})")
                            break
                    except:
                        pass

                if not board_pre_selected:
                    logger.warning(f"게시판 미선택 상태 — _select_board 호출 (menu_id={menu_id})")
                    await _select_board(page, editor, menu_id, board_name=board_name)
            else:
                await _select_board(page, editor, menu_id, board_name=board_name)

            await _dismiss_popups(page, editor)
            
            # 6. 본문 입력
            await _input_title_and_body(page, editor, title, sections)
            
            # 7. 발행
            if on_progress: on_progress("publish", "발행 제출 중...")
            pub_ok = await _click_publish(page, editor)
            
            if pub_ok:
                # ── 발행 후 게시물 URL 확정 ──────────────────────────────────────────
                # 네이버 신 에디터(ca-fe)는 등록 후 SPA 방식으로 URL이 변경됨.
                # 새 URL 형식: /ca-fe/cafes/{id}/articles/{articleId}
                # 구 URL 형식: /ArticleRead.nhn?clubid=...&articleid=...
                #              /cafe명/articleId  (단축형)
                def _is_article_url(url: str) -> bool:
                    """게시물 URL인지 판단 (write/edit 페이지 제외)"""
                    if not url:
                        return False
                    low = url.lower()
                    if "write" in low or "edit" in low:
                        return False
                    # 신 에디터: /ca-fe/ 또는 /f-e/ 경로
                    if re.search(r"/(ca-fe|f-e)/cafes/\d+/articles/\d+", url):
                        return True
                    if "ArticleRead.nhn" in url and "articleid=" in low:
                        return True
                    if re.search(re.escape(cafe_alias) + r"/\d+", url):
                        return True
                    # 카페 전체글 URL (clubid + articleid)
                    if "clubid=" in low and "articleid=" in low:
                        return True
                    return False

                final_url = page.url
                logger.info("발행 후 리다이렉트 대기 중...")
                import time as t_
                start_wait = t_.time()
                while t_.time() - start_wait < 60:  # 리다이렉트 대기 시간을 30초에서 60초로 넉넉하게 연장
                    cur = page.url
                    logger.debug(f"리다이렉트 대기 중... 현재 URL: {cur}")
                    if _is_article_url(cur):
                        final_url = cur
                        logger.info(f"리다이렉트 감지 성공: {final_url}")
                        break
                    await asyncio.sleep(0.8)

                # 리다이렉트 대기 후 실제 URL 로그
                logger.info(f"리다이렉트 대기 완료 — 현재 URL: {page.url}")
                await capture_debug(page, "after_publish")

                # ── 폴백 1: JS로 페이지에서 articleId 직접 추출 ──────────────────────
                if not _is_article_url(final_url):
                    logger.warning("리다이렉트 감지 실패 → JS/소스에서 articleId 추출 시도")
                    # JS로 window.__INITIAL_STATE__ 또는 meta 태그에서 추출
                    try:
                        aid_js = await page.evaluate("""() => {
                            // 방법 1: Naver SPA 전역 상태
                            try {
                                const s = window.__INITIAL_STATE__ || window.__nuxt__?.__vue_store__?.state;
                                if (s) {
                                    const aid = s?.article?.id || s?.articleId || s?.article?.articleId;
                                    if (aid) return String(aid);
                                }
                            } catch(e) {}
                            // 방법 2: URL 파라미터 (현재 페이지 URL에 이미 있을 수도)
                            const up = new URLSearchParams(location.search);
                            const fromUrl = up.get('articleId') || up.get('articleid');
                            if (fromUrl) return fromUrl;
                            // 방법 3: meta og:url
                            const og = document.querySelector('meta[property="og:url"]');
                            if (og) {
                                const m = og.content.match(/articles\\/(\d+)/);
                                if (m) return m[1];
                            }
                            // 방법 4: DOM 내 data-article-id
                            const el = document.querySelector('[data-article-id],[data-articleid]');
                            if (el) return el.dataset.articleId || el.dataset.articleid || '';
                            return '';
                        }""")
                        if aid_js:
                            final_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_numeric_id}/articles/{aid_js}"
                            logger.info(f"JS 추출로 URL 복구: {final_url}")
                    except Exception as je:
                        logger.warning(f"JS 추출 실패: {je}")

                # ── 폴백 2: 소스에서 articleId 정규식 추출 ───────────────────────────
                if not _is_article_url(final_url):
                    try:
                        page_source = await page.content()
                        # 새 형식: "articleId":654  또는  /articles/654
                        for pat in [
                            r'"articleId"\s*:\s*(\d+)',
                            r'/articles/(\d+)',
                            r'articleid=(\d+)',
                            r'data-article-id=["\']?(\d+)',
                        ]:
                            m_id = re.search(pat, page_source, re.IGNORECASE)
                            if m_id:
                                aid = m_id.group(1)
                                final_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_numeric_id}/articles/{aid}"
                                logger.info(f"소스 분석으로 URL 복구: {final_url}")
                                break
                    except Exception as se:
                        logger.warning(f"소스 분석 실패: {se}")

                # ── 폴백 3: Naver Cafe 검색 API (브라우저 쿠키 재사용) ───────────────
                if not _is_article_url(final_url):
                    logger.warning("폴백 3: 카페 최신글 검색 API 시도")
                    try:
                        import httpx
                        # 신 API 엔드포인트 (리다이렉트 없음)
                        new_api = (
                            f"https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/{cafe_numeric_id}"
                            f"/menus/{menu_id}/articles?page=1&perPage=5&sort=createDate"
                        )
                        cookie_header = "; ".join(
                            f"{c['name']}={c['value']}"
                            for c in await context.cookies("https://cafe.naver.com")
                        )
                        headers = {
                            "Cookie": cookie_header,
                            "Referer": f"https://cafe.naver.com/{cafe_alias}",
                        }
                        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as hc:
                            resp = await hc.get(new_api, headers=headers)
                        if resp.status_code == 200:
                            data = resp.json()
                            articles = (
                                data.get("result", {}).get("articleList", []) or
                                data.get("articleList", []) or
                                data.get("items", [])
                            )
                            if articles:
                                # 제목 매칭 우선
                                matched_aid = None
                                for art in articles:
                                    art_title = art.get("subject", art.get("title", ""))
                                    art_id = art.get("articleId", art.get("id", ""))
                                    if title and title[:8] in art_title:
                                        matched_aid = art_id
                                        break
                                if not matched_aid and articles:
                                    matched_aid = articles[0].get("articleId", articles[0].get("id", ""))
                                if matched_aid:
                                    final_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_numeric_id}/articles/{matched_aid}"
                                    logger.info(f"신 API로 URL 복구: {final_url}")
                    except Exception as fe:
                        logger.error(f"폴백 3 API 실패: {fe}")

                # ── 최종 판정 ────────────────────────────────────────────────────────
                if _is_article_url(final_url):
                    result["success"] = True
                    result["url"] = final_url
                else:
                    result["success"] = False
                    result["error"] = "게시글 발행은 되었으나, 실제 게시글 주소를 확인하지 못했습니다. (리다이렉트 지연)"
                logger.info(f"글 발행 완료! URL: {final_url}")
                if on_progress: on_progress("success", f"발행 성공 ({final_url})")

            else:
                result["error"] = "발행 버튼 클릭 실패"
                
        except Exception as e:
            logger.error(f"카페 발행 오류: {e}")
            result["error"] = str(e)
            try:
                pages = context.pages
                if pages:
                    await capture_debug(pages[-1], "publish_error")
            except:
                pass
        finally:
            await browser.close()
            
    return result

# 기존 동기 함수 (main.py 호출 등 호환성 위함)
def publish_to_cafe(account, cafe_url, menu_id, title, content="", image_path=None, headless=True, on_progress=None, structured_content=None, board_name="", footer_link="", footer_link_text=""):
    """
    구조적 호환성을 위한 동기 함수 래퍼. 별도 스레드에서 새 이벤트 루프 실행.
    """
    import concurrent.futures
    sections = structured_content.get("sections", []) if structured_content else [{"type": "text", "lines": [{"text": content, "style": "normal"}]}]

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                async_publish_to_cafe(
                    account=account,
                    cafe_url=cafe_url,
                    menu_id=menu_id,
                    title=title,
                    sections=sections,
                    headless=headless,
                    on_progress=on_progress
                )
            )
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(_run).result()


async def async_post_comment(
    account: dict,
    post_url: str,
    comment_text: str,
    headless: bool = True,
) -> dict:
    """Playwright 기반 카페 댓글 작성"""
    result = {"success": False, "error": None, "cookies": None}

    async with async_playwright() as pw:
        # ★ 수정: (browser, context) 올바르게 언패킹
        account_id = account.get("id")
        proxy = None
        try:
            proxy = await _get_proxy_for_account(account_id) if account_id else None
        except Exception:
            pass

        browser, context = await create_stealth_context(pw, proxy=proxy, headless=headless)
        try:
            plain_pw = decrypt_password(account["password_enc"]) if account.get("password_enc") else ""
            is_logged_in = await login(context, account["username"], plain_pw, account_id)
            if not is_logged_in:
                raise Exception("로그인 실패")

            page = await context.new_page()
            await page.goto(post_url, wait_until="domcontentloaded", timeout=30000)
            await random_delay(2, 4)

            # 명시적으로 cafe_main iframe 대기 (만약 있다면)
            editor_frame = page
            try:
                frame_el = await page.wait_for_selector("iframe#cafe_main, iframe[name='cafe_main']", timeout=8000)
                if frame_el:
                    editor_frame = await frame_el.content_frame() or page
            except:
                pass

            # 브라우저 스크롤을 내려서 댓글 영역 로딩을 유도
            try:
                await editor_frame.evaluate("window.scrollTo(0, document.body.scrollHeight || 3000)")
            except:
                pass
            await random_delay(1, 2)

            comment_written = False
            ta = None
            active_frame = None

            # 1. editor_frame에서 먼저 대기해보기
            try:
                ta = await editor_frame.wait_for_selector(".comment_inbox_text, .comment_inbox textarea, [placeholder*='댓글'], #commentArea", timeout=8000, state="visible")
                active_frame = editor_frame
            except:
                pass

            # 2. 못 찾았으면 모든 프레임 순회하며 체크 (최후의 수단)
            if not ta:
                for frame in page.frames:
                    try:
                        ta = await frame.query_selector(".comment_inbox_text, .comment_inbox textarea, [placeholder*='댓글'], #commentArea")
                        if ta and await ta.is_visible():
                            active_frame = frame
                            break
                    except:
                        continue

            if ta and active_frame:
                await ta.click()
                await random_delay(0.3, 0.7)
                for ch in comment_text:
                    await page.keyboard.type(ch, delay=random.randint(20, 50))
                
                # 등록 버튼 찾기 및 클릭
                submit = await active_frame.query_selector(".btn_comment_write, .btn_register, button:has-text('등록')")
                if submit:
                    await submit.click()
                else:
                    await page.keyboard.press("Control+Enter")
                
                comment_written = True

            if not comment_written:
                raise Exception("댓글 입력창을 찾을 수 없습니다.")

            await random_delay(2, 3)
            cookies = await context.cookies()
            result["cookies"] = json.dumps(cookies, ensure_ascii=False)
            result["success"] = True
        except Exception as e:
            logger.error(f"댓글 작성 오류: {e}")
            result["error"] = str(e)
        finally:
            await browser.close()

    return result


def post_comment(account, post_url, comment_text, headless=True):
    """동기 래퍼 - 별도 스레드에서 새 이벤트 루프 실행"""
    import concurrent.futures

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                async_post_comment(
                    account=account,
                    post_url=post_url,
                    comment_text=comment_text,
                    headless=headless,
                )
            )
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        return ex.submit(_run).result()
