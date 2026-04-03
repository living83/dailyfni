"""
Naver blog SE ONE editor publisher.
Ported from naver-auto project, adapted for dailyfni.
Automates Naver blog posting using Playwright.
"""

import asyncio
import html
import json
import random
import re

from loguru import logger
from playwright.async_api import async_playwright

from browser.se_helpers import (
    create_stealth_context,
    login,
    random_delay,
    try_selectors,
    capture_debug,
    _get_proxy_for_account,
)


# ---------------------------------------------------------------------------
# HTML to text conversion
# ---------------------------------------------------------------------------

def _html_to_text(html_content: str) -> str:
    """Convert HTML to plain text suitable for the SE ONE editor.

    - Strips text effect tags (keeps inner text).
    - Converts headings to ``## heading`` markdown prefix.
    - Converts ``</p>`` to double newline, ``<br>`` to newline, ``<li>`` to ``- item``.
    - Strips remaining HTML tags.
    - Unescapes HTML entities.
    - Cleans up multiple consecutive blank lines.
    """
    if not html_content:
        return ""

    text = html_content

    # Strip text-effect tags but keep inner content
    effect_tags = r"(?:s|del|strike|u|ins|em|i|mark|strong|b|font|span)"
    text = re.sub(
        rf"</?{effect_tags}(?:\s[^>]*)?>",
        "",
        text,
        flags=re.IGNORECASE,
    )

    # Headings → markdown prefix
    for level in range(1, 7):
        text = re.sub(
            rf"<h{level}[^>]*>(.*?)</h{level}>",
            r"## \1\n\n",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )

    # Paragraph / line breaks
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)

    # List items
    text = re.sub(r"<li[^>]*>", "- ", text, flags=re.IGNORECASE)
    text = re.sub(r"</li\s*>", "\n", text, flags=re.IGNORECASE)

    # Strip all remaining HTML tags
    text = re.sub(r"<[^>]+>", "", text)

    # Unescape HTML entities
    text = html.unescape(text)

    # Clean up excessive blank lines (3+ → 2)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ---------------------------------------------------------------------------
# Draft popup
# ---------------------------------------------------------------------------

async def _dismiss_draft_popup(page) -> None:
    """Handle the '작성 중인 글이 있습니다' draft-recovery popup.

    Clicks the '취소' button to start a fresh post.  Checks the main page
    and all child frames.
    """
    cancel_selectors = [
        "button:has-text('취소')",
        "button:has-text('아니오')",
        "button:has-text('아니요')",
        "a:has-text('취소')",
        ".se-popup-button-cancel",
        "button.cancel",
    ]

    # Check main page
    cancel_btn = await try_selectors(page, cancel_selectors, timeout=3000)
    if cancel_btn:
        try:
            await cancel_btn.click()
            logger.info("Dismissed draft popup on main page")
            await random_delay(0.5, 1.0)
            return
        except Exception as exc:
            logger.warning(f"Failed to click draft cancel on main page: {exc}")

    # Check all frames
    for frame in page.frames:
        try:
            cancel_btn = await try_selectors(frame, cancel_selectors, timeout=2000)
            if cancel_btn:
                await cancel_btn.click()
                logger.info("Dismissed draft popup in frame")
                await random_delay(0.5, 1.0)
                return
        except Exception:
            continue

    logger.debug("No draft popup detected")


# ---------------------------------------------------------------------------
# Navigate to blog write page
# ---------------------------------------------------------------------------

async def _navigate_to_blog_write(page, naver_id: str):
    """Navigate to the blog write page with a 3-step fallback strategy.

    Returns ``(page, reached)`` where *page* may be a new tab that opened
    and *reached* indicates whether the editor page was successfully loaded.
    """
    write_btn_selectors = [
        "a:has-text('글쓰기')",
        "a[href*='postwrite']",
        "a[href*='PostWriteForm']",
        "button:has-text('글쓰기')",
        ".blog_write_btn",
        "#writeBtn",
        "a.btn_write",
        "a.link_write",
    ]

    # ---- Plan A: blog.naver.com → 글쓰기 button ----
    try:
        logger.info("Plan A: navigating to blog.naver.com")
        await page.goto(
            "https://blog.naver.com",
            wait_until="domcontentloaded",
            timeout=20000,
        )
        await random_delay(1.5, 3.0)

        write_btn = await try_selectors(page, write_btn_selectors, timeout=8000)
        if write_btn:
            # The button may open a new tab
            async with page.context.expect_page(timeout=10000) as new_page_info:
                await write_btn.click()
            try:
                new_page = await new_page_info.value
                await new_page.wait_for_load_state("domcontentloaded", timeout=15000)
                logger.info(f"Plan A: new tab opened → {new_page.url}")
                await random_delay(1.0, 2.0)
                return new_page, True
            except Exception:
                # Stayed on the same page / no new tab
                await random_delay(1.0, 2.0)
                if "postwrite" in page.url.lower() or "PostWriteForm" in page.url:
                    logger.info(f"Plan A: navigated in same tab → {page.url}")
                    return page, True
    except Exception as exc:
        logger.warning(f"Plan A failed: {exc}")

    # ---- Plan B: blog.naver.com/{naver_id} → 글쓰기 button ----
    try:
        logger.info("Plan B: navigating to user blog page")
        await page.goto(
            f"https://blog.naver.com/{naver_id}",
            wait_until="domcontentloaded",
            timeout=20000,
        )
        await random_delay(1.5, 3.0)

        write_btn = await try_selectors(page, write_btn_selectors, timeout=8000)
        if write_btn:
            async with page.context.expect_page(timeout=10000) as new_page_info:
                await write_btn.click()
            try:
                new_page = await new_page_info.value
                await new_page.wait_for_load_state("domcontentloaded", timeout=15000)
                logger.info(f"Plan B: new tab opened → {new_page.url}")
                await random_delay(1.0, 2.0)
                return new_page, True
            except Exception:
                await random_delay(1.0, 2.0)
                if "postwrite" in page.url.lower() or "PostWriteForm" in page.url:
                    logger.info(f"Plan B: navigated in same tab → {page.url}")
                    return page, True
    except Exception as exc:
        logger.warning(f"Plan B failed: {exc}")

    # ---- Plan C: direct URL ----
    direct_urls = [
        f"https://blog.naver.com/{naver_id}/postwrite",
        f"https://blog.naver.com/PostWriteForm.naver?blogId={naver_id}",
    ]
    for url in direct_urls:
        try:
            logger.info(f"Plan C: direct navigation to {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await random_delay(2.0, 3.0)

            current = page.url
            if "postwrite" in current.lower() or "PostWriteForm" in current:
                logger.info(f"Plan C: reached editor → {current}")
                return page, True
        except Exception as exc:
            logger.warning(f"Plan C ({url}) failed: {exc}")

    logger.error("All navigation plans failed")
    await capture_debug(page, "navigate_all_failed")
    return page, False


# ---------------------------------------------------------------------------
# Editor detection
# ---------------------------------------------------------------------------

async def _detect_editor(page):
    """Find the SE ONE editor (iframe or direct element).

    Returns ``(editor, is_frame)`` where *editor* is a Frame or Page-like
    object containing the editor, and *is_frame* indicates whether it's
    inside an iframe.
    """
    # Check 1: mainFrame (editor loaded directly in the page)
    try:
        editor_el = await page.query_selector(
            ".se-component-content[contenteditable='true']"
        )
        if editor_el:
            logger.info("Editor detected: directly in mainFrame")
            return page, False
    except Exception:
        pass

    # Check 2: named iframes
    iframe_names = ["se_editFrame", "editor_frame"]
    for name in iframe_names:
        try:
            frame = page.frame(name=name)
            if frame:
                logger.info(f"Editor detected: iframe '{name}'")
                return frame, True
        except Exception:
            continue

    # Check 3: any iframe with contenteditable
    for frame in page.frames:
        if frame == page.main_frame:
            continue
        try:
            editable = await frame.query_selector("[contenteditable='true']")
            if editable:
                logger.info(f"Editor detected: contenteditable frame ({frame.name})")
                return frame, True
        except Exception:
            continue

    # Fallback: treat main page as the editor
    logger.warning("No editor iframe found; falling back to main page")
    return page, False


# ---------------------------------------------------------------------------
# Title input
# ---------------------------------------------------------------------------

async def _input_title(page, editor, title: str) -> bool:
    """Type the post title character by character with human-like delay.

    Returns True on success.
    """
    title_selectors = [
        ".se-title-text .se-text-paragraph",
        ".se-title-text",
        "textarea.se-ff-nanumgothic",
        "input[placeholder*='제목']",
        "textarea[placeholder*='제목']",
        ".se-component-title textarea",
        ".se-component-title [contenteditable='true']",
        "[class*='title'] [contenteditable='true']",
        "#post-title",
        "textarea#title",
    ]

    title_el = await try_selectors(editor, title_selectors, timeout=10000)
    if not title_el:
        # Try on the page itself if editor is a frame
        title_el = await try_selectors(page, title_selectors, timeout=5000)

    if not title_el:
        logger.error("Could not find title input field")
        await capture_debug(page, "title_field_not_found")
        return False

    try:
        await title_el.click()
        await random_delay(0.3, 0.6)

        for char in title:
            await title_el.type(char, delay=random.randint(30, 70))

        logger.info(f"Title entered: {title[:50]}...")
        await random_delay(0.3, 0.7)
        return True
    except Exception as exc:
        logger.error(f"Failed to input title: {exc}")
        await capture_debug(page, "title_input_error")
        return False


# ---------------------------------------------------------------------------
# Body input
# ---------------------------------------------------------------------------

async def _input_body(page, editor, content: str) -> None:
    """Type post body line by line with human-like pauses.

    - Lines starting with ``## `` are toggled bold.
    - Lines starting with ``- `` are converted to bullet points (``\u2022 ``).
    - Remaining markdown syntax (``**``, ``~~``, ``__``) is stripped.
    - Random pauses simulate human behaviour.
    """
    body_selectors = [
        ".se-text-paragraph",
        "[contenteditable='true']",
        ".se-component-content",
        ".se-section-text .se-text-paragraph",
        "#post-body",
    ]

    body_el = await try_selectors(editor, body_selectors, timeout=10000)
    if not body_el:
        body_el = await try_selectors(page, body_selectors, timeout=5000)

    if not body_el:
        logger.error("Could not find body input field")
        await capture_debug(page, "body_field_not_found")
        return

    try:
        await body_el.click()
        await random_delay(0.3, 0.6)
    except Exception as exc:
        logger.warning(f"Could not click body element: {exc}")

    # Convert HTML to plain text if needed
    plain = _html_to_text(content) if "<" in content else content
    lines = plain.split("\n")

    for line in lines:
        stripped = line.strip()

        # Heading line → bold toggle
        if stripped.startswith("## "):
            heading_text = stripped[3:]
            # Toggle bold on
            await page.keyboard.down("Control")
            await page.keyboard.press("b")
            await page.keyboard.up("Control")
            await random_delay(0.1, 0.2)

            for char in heading_text:
                await page.keyboard.type(char, delay=random.randint(25, 45))

            await page.keyboard.press("Enter")
            await page.keyboard.press("Enter")
            await random_delay(0.1, 0.2)

            # Toggle bold off
            await page.keyboard.down("Control")
            await page.keyboard.press("b")
            await page.keyboard.up("Control")
            await random_delay(0.1, 0.3)
            continue

        # Bullet point
        if stripped.startswith("- "):
            stripped = "\u2022 " + stripped[2:]

        # Strip remaining markdown artifacts
        stripped = stripped.replace("**", "")
        stripped = stripped.replace("~~", "")
        stripped = stripped.replace("__", "")

        # Type the line
        if stripped:
            for char in stripped:
                await page.keyboard.type(char, delay=random.randint(25, 45))

                # Random pauses to mimic human typing
                roll = random.random()
                if roll < 0.03:
                    await random_delay(3.0, 6.0)
                elif roll < 0.10:
                    await random_delay(0.8, 2.0)

        await page.keyboard.press("Enter")
        await random_delay(0.05, 0.15)

    logger.info("Body content entered")


# ---------------------------------------------------------------------------
# Tags input
# ---------------------------------------------------------------------------

async def _input_tags(page, editor, tags: list) -> None:
    """Type tags into the tag input field (max 10).

    Each tag is followed by Enter to confirm.
    """
    if not tags:
        return

    tag_selectors = [
        ".se-tag-input input",
        "input[placeholder*='태그']",
        "input[placeholder*='Tag']",
        ".se-section-tag input",
        "#post-tag",
        "input.tag_input",
        ".tag_area input",
        "input[type='text'][class*='tag']",
    ]

    tag_el = await try_selectors(editor, tag_selectors, timeout=8000)
    if not tag_el:
        tag_el = await try_selectors(page, tag_selectors, timeout=5000)

    if not tag_el:
        logger.warning("Tag input field not found, skipping tags")
        await capture_debug(page, "tag_field_not_found")
        return

    try:
        await tag_el.click()
        await random_delay(0.3, 0.6)
    except Exception as exc:
        logger.warning(f"Could not click tag element: {exc}")
        return

    entered = 0
    for tag in tags[:10]:
        tag = str(tag).strip()
        if not tag:
            continue

        for char in tag:
            await tag_el.type(char, delay=random.randint(40, 80))

        await page.keyboard.press("Enter")
        await random_delay(0.3, 0.6)
        entered += 1

    logger.info(f"Entered {entered} tag(s)")


# ---------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------

async def _click_publish(page, editor) -> bool:
    """Execute the two-step publish flow.

    1. Click the toolbar '발행' button.
    2. Wait for the settings panel and click the confirm '발행' button.

    Returns True if both clicks succeeded.
    """

    # ---- Step 1: Toolbar publish button ----
    toolbar_selectors = [
        "button:has-text('발행')",
        "button.se-publish-btn",
        "button.publish_btn",
        "#publish-btn",
        "button[data-action='publish']",
        ".se-toolbar button:has-text('발행')",
    ]

    toolbar_btn = await try_selectors(page, toolbar_selectors, timeout=8000)
    if not toolbar_btn:
        toolbar_btn = await try_selectors(editor, toolbar_selectors, timeout=5000)

    if toolbar_btn:
        try:
            await toolbar_btn.click()
            logger.info("Clicked toolbar publish button")
            await random_delay(1.5, 3.0)
        except Exception as exc:
            logger.warning(f"Toolbar publish click failed: {exc}")
    else:
        # Fallback: try evaluating JS
        try:
            clicked = await page.evaluate("""
                () => {
                    const btns = document.querySelectorAll('button');
                    for (const btn of btns) {
                        if (btn.textContent.includes('발행')) {
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                }
            """)
            if clicked:
                logger.info("Clicked toolbar publish via JS evaluation")
                await random_delay(1.5, 3.0)
            else:
                logger.error("Toolbar publish button not found by any method")
                await capture_debug(page, "publish_toolbar_not_found")
                return False
        except Exception as exc:
            logger.error(f"JS publish click failed: {exc}")
            await capture_debug(page, "publish_toolbar_js_error")
            return False

    # ---- Step 2: Confirm publish button in settings panel ----
    confirm_selectors = [
        ".se-popup-publish-btn",
        "button.se-popup-button-publish",
        "button.confirm_btn:has-text('발행')",
        ".se-publish-popup button:has-text('발행')",
        "button.btn_publish",
        "#publishBtn",
        "button[data-action='confirm-publish']",
        ".layer_post button:has-text('발행')",
    ]

    confirm_btn = await try_selectors(page, confirm_selectors, timeout=10000)
    if confirm_btn:
        try:
            await confirm_btn.click()
            logger.info("Clicked confirm publish button")
            await random_delay(2.0, 4.0)
            return True
        except Exception as exc:
            logger.warning(f"Confirm publish click failed: {exc}")

    # Fallback: JS evaluation for the confirm button
    try:
        clicked = await page.evaluate("""
            () => {
                const btns = document.querySelectorAll('button');
                let found = false;
                for (const btn of btns) {
                    if (btn.textContent.includes('발행') && !found) {
                        found = true;
                        continue;  // skip the first (toolbar) one
                    }
                    if (btn.textContent.includes('발행') && found) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            }
        """)
        if clicked:
            logger.info("Clicked confirm publish via JS")
            await random_delay(2.0, 4.0)
            return True
    except Exception as exc:
        logger.warning(f"JS confirm publish failed: {exc}")

    # Fallback: coordinate click (center of viewport, typical location)
    try:
        viewport = page.viewport_size
        if viewport:
            cx = viewport["width"] // 2
            cy = viewport["height"] // 2 + 100
            await page.mouse.click(cx, cy)
            logger.info(f"Attempted coordinate click at ({cx}, {cy})")
            await random_delay(1.0, 2.0)

            # Last resort: press Enter
            await page.keyboard.press("Enter")
            await random_delay(2.0, 4.0)
            return True
    except Exception as exc:
        logger.warning(f"Coordinate / Enter fallback failed: {exc}")

    logger.error("Failed to complete publish flow")
    await capture_debug(page, "publish_confirm_failed")
    return False


# ---------------------------------------------------------------------------
# Publish verification
# ---------------------------------------------------------------------------

async def _verify_publish(page, pre_url: str) -> dict:
    """Check whether the post was published successfully.

    Inspects the current URL for PostView or a published blog URL pattern.
    Returns ``{"success": bool, "url": str | None, "error": str | None}``.
    """
    try:
        await random_delay(2.0, 4.0)

        current_url = page.url
        logger.debug(f"Pre-publish URL: {pre_url}")
        logger.debug(f"Post-publish URL: {current_url}")

        # Check for PostView redirect
        if "PostView" in current_url or "postView" in current_url:
            logger.info(f"Publish verified via PostView URL: {current_url}")
            return {"success": True, "url": current_url, "error": None}

        # Check if URL changed to a published blog post pattern
        if current_url != pre_url and (
            "/blog/" in current_url
            or "blog.naver.com" in current_url
        ):
            # Could be the published post
            if "postwrite" not in current_url.lower() and "PostWriteForm" not in current_url:
                logger.info(f"Publish likely succeeded, URL changed: {current_url}")
                return {"success": True, "url": current_url, "error": None}

        # Wait a bit longer and re-check
        await random_delay(3.0, 5.0)
        final_url = page.url
        if final_url != pre_url and (
            "PostView" in final_url
            or "postView" in final_url
            or (
                "postwrite" not in final_url.lower()
                and "PostWriteForm" not in final_url
                and "blog.naver.com" in final_url
            )
        ):
            logger.info(f"Publish verified after wait: {final_url}")
            return {"success": True, "url": final_url, "error": None}

        logger.warning(f"Publish verification uncertain, URL: {final_url}")
        await capture_debug(page, "publish_verify_uncertain")
        return {
            "success": False,
            "url": final_url,
            "error": "URL did not change to a published post",
        }

    except Exception as exc:
        logger.error(f"Publish verification error: {exc}")
        return {"success": False, "url": None, "error": str(exc)}


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def publish_single_post(account: dict, post_data: dict) -> dict:
    """Publish a single blog post through the Naver SE ONE editor.

    Parameters
    ----------
    account : dict
        Keys: ``id``, ``account_name``, ``naver_id``, ``naver_password``.
    post_data : dict
        Keys: ``title``, ``content``, ``keywords`` (JSON string or list),
        ``keyword``, ``post_type`` (``'general'`` | ``'ad'``).

    Returns
    -------
    dict
        ``{"success": bool, "url": str | None, "error": str | None}``
    """
    naver_id = account.get("naver_id", "")
    naver_password = account.get("naver_password", "")
    account_id = str(account.get("id", naver_id))
    account_name = account.get("account_name", naver_id)

    title = post_data.get("title", "")
    content = post_data.get("content", "")
    keywords_raw = post_data.get("keywords", [])
    keyword = post_data.get("keyword", "")
    post_type = post_data.get("post_type", "general")

    # Parse keywords
    if isinstance(keywords_raw, str):
        try:
            tags = json.loads(keywords_raw)
        except (json.JSONDecodeError, TypeError):
            tags = [k.strip() for k in keywords_raw.split(",") if k.strip()]
    elif isinstance(keywords_raw, list):
        tags = keywords_raw
    else:
        tags = []

    # Ensure the main keyword is included
    if keyword and keyword not in tags:
        tags.insert(0, keyword)

    logger.info(
        f"Publishing post for account '{account_name}' "
        f"(type={post_type}): {title[:60]}"
    )

    browser = None
    pw_instance = None

    try:
        # ---- 1. Create stealth browser context ----
        pw_instance = await async_playwright().start()
        proxy = _get_proxy_for_account(account_id)

        browser, context = await create_stealth_context(
            pw_instance,
            proxy=proxy,
            headless=True,
        )

        # ---- 2. Navigate to naver.com and login ----
        logged_in = await login(
            context,
            naver_id=naver_id,
            naver_password=naver_password,
            account_id=account_id,
        )
        if not logged_in:
            return {
                "success": False,
                "url": None,
                "error": f"Login failed for account '{account_name}'",
            }

        page = await context.new_page()

        # ---- 3. Navigate to blog write page ----
        page, reached = await _navigate_to_blog_write(page, naver_id)
        if not reached:
            return {
                "success": False,
                "url": None,
                "error": "Failed to navigate to blog write page",
            }

        # ---- 4. Detect editor, dismiss popups, disable spellcheck ----
        await random_delay(1.0, 2.0)
        await _dismiss_draft_popup(page)

        editor, is_frame = await _detect_editor(page)

        # Disable spellcheck
        try:
            await page.evaluate("""
                () => {
                    document.querySelectorAll('[contenteditable]').forEach(el => {
                        el.setAttribute('spellcheck', 'false');
                    });
                }
            """)
            if is_frame:
                await editor.evaluate("""
                    () => {
                        document.querySelectorAll('[contenteditable]').forEach(el => {
                            el.setAttribute('spellcheck', 'false');
                        });
                    }
                """)
        except Exception:
            pass

        # ---- 5. Input title → Tab → body → tags ----
        title_ok = await _input_title(page, editor, title)
        if not title_ok:
            return {
                "success": False,
                "url": None,
                "error": "Failed to input title",
            }

        # Tab to move to body
        await page.keyboard.press("Tab")
        await random_delay(0.5, 1.0)

        await _input_body(page, editor, content)
        await random_delay(0.5, 1.5)

        await _input_tags(page, editor, tags)
        await random_delay(0.5, 1.0)

        # ---- 6. Click publish → verify ----
        pre_url = page.url
        publish_ok = await _click_publish(page, editor)
        if not publish_ok:
            return {
                "success": False,
                "url": None,
                "error": "Publish button click failed",
            }

        result = await _verify_publish(page, pre_url)

        if result["success"]:
            logger.info(
                f"Post published successfully for '{account_name}': {result['url']}"
            )
        else:
            logger.warning(
                f"Publish may have failed for '{account_name}': {result.get('error')}"
            )
            await capture_debug(page, f"publish_final_{account_id}")

        return result

    except Exception as exc:
        logger.error(f"publish_single_post error for '{account_name}': {exc}")
        return {"success": False, "url": None, "error": str(exc)}

    finally:
        # ---- 7. Cleanup ----
        try:
            if browser:
                await browser.close()
        except Exception:
            pass
        try:
            if pw_instance:
                await pw_instance.stop()
        except Exception:
            pass
