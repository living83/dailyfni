"""
Playwright-based neighbor blog engagement module.

Automates visiting neighbor blogs, clicking likes, and posting comments
on the Naver blogging platform.
"""

import asyncio
import random
import re
from datetime import datetime

from loguru import logger
from playwright.async_api import async_playwright

from browser.se_helpers import (
    capture_debug,
    create_stealth_context,
    login,
    random_delay,
    try_selectors,
)

# ---------------------------------------------------------------------------
# Like / Heart
# ---------------------------------------------------------------------------

LIKE_SELECTORS = [
    ".u_likeit_list_btn",
    'button[data-action="like"]',
    ".sympathy_btn",
    ".btn_sympathy",
    "a.u_likeit_list_btn",
    'button[class*="like"]',
    'a[class*="sympathy"]',
    'button[class*="sympathy"]',
    ".post_sympathy_btn",
    "#sympathyBtn",
]


async def click_like(page) -> bool:
    """Find and click the heart/like button on a Naver blog post.

    Tries multiple CSS selectors with fallbacks.  Returns True if a like
    button was found and clicked, False otherwise.
    """
    try:
        # Some Naver blogs load the like widget inside an iframe.
        # Try the main page first, then fall back to iframes.
        element = await try_selectors(page, LIKE_SELECTORS, timeout=5000)

        if not element:
            # Search inside iframes
            for frame in page.frames:
                if frame == page.main_frame:
                    continue
                element = await try_selectors(frame, LIKE_SELECTORS, timeout=3000)
                if element:
                    break

        if not element:
            logger.warning("Like button not found on page")
            await capture_debug(page, "like_button_not_found")
            return False

        await random_delay(0.3, 0.8)
        await element.click()
        logger.info("Like button clicked")
        await random_delay(1.0, 2.0)
        return True

    except Exception as exc:
        logger.error(f"Failed to click like button: {exc}")
        await capture_debug(page, "like_click_error")
        return False


# ---------------------------------------------------------------------------
# Comment writing
# ---------------------------------------------------------------------------

COMMENT_INPUT_SELECTORS = [
    ".u_cbox_inbox textarea",
    ".u_cbox_text",
    "#naverComment textarea",
    ".comment_inbox textarea",
    "textarea.u_cbox_text",
    'textarea[placeholder*="댓글"]',
    ".comment_writer textarea",
    ".CommentWriter textarea",
]

COMMENT_SUBMIT_SELECTORS = [
    'button.u_cbox_btn_upload',
    'button:has-text("등록")',
    'a:has-text("등록")',
    'button:has-text("작성")',
    'button[type="submit"]',
    '.u_cbox_btn_submit',
    'button.comment_submit',
    'button.btn_register',
]


async def _find_comment_input(page):
    """Search for the comment textarea in the main page and any iframes.

    Returns a tuple of (element, frame_or_page) or (None, None).
    """
    # Try main page first
    element = await try_selectors(page, COMMENT_INPUT_SELECTORS, timeout=5000)
    if element:
        return element, page

    # Try iframes that look comment-related
    for frame in page.frames:
        if frame == page.main_frame:
            continue
        frame_name = frame.name or ""
        frame_url = frame.url or ""
        if any(kw in frame_name.lower() for kw in ("cbox", "comment")) or any(
            kw in frame_url.lower() for kw in ("cbox", "comment")
        ):
            element = await try_selectors(frame, COMMENT_INPUT_SELECTORS, timeout=3000)
            if element:
                return element, frame

    # Last resort: try every iframe
    for frame in page.frames:
        if frame == page.main_frame:
            continue
        element = await try_selectors(frame, COMMENT_INPUT_SELECTORS, timeout=2000)
        if element:
            return element, frame

    return None, None


async def write_comment(page, comment_text: str) -> bool:
    """Find the comment input area and post *comment_text*.

    Steps:
        1. Locate comment textarea (main page or iframes).
        2. Click to focus.
        3. Type the comment with a human-like random delay per character.
        4. Click the submit / register button.
        5. Wait briefly for confirmation.

    Returns True if the comment was posted successfully, False otherwise.
    """
    try:
        element, target = await _find_comment_input(page)

        if not element:
            logger.warning("Comment input area not found")
            await capture_debug(page, "comment_input_not_found")
            return False

        # Focus and click into the textarea
        await element.click()
        await random_delay(0.5, 1.0)

        # Type each character with a human-like delay (30-60 ms)
        for char in comment_text:
            await element.type(char, delay=random.randint(30, 60))

        await random_delay(0.5, 1.0)

        # Find and click the submit button within the same context
        submit_btn = await try_selectors(target, COMMENT_SUBMIT_SELECTORS, timeout=5000)
        if not submit_btn:
            logger.warning("Comment submit button not found")
            await capture_debug(page, "comment_submit_not_found")
            return False

        await submit_btn.click()
        logger.info("Comment submitted")

        # Wait for the comment to be registered
        await random_delay(2.0, 3.5)
        return True

    except Exception as exc:
        logger.error(f"Failed to write comment: {exc}")
        await capture_debug(page, "comment_write_error")
        return False


# ---------------------------------------------------------------------------
# Main engagement entry point
# ---------------------------------------------------------------------------


async def engage_neighbor(
    account: dict,
    blog_url: str,
    actions: dict,
    progress_callback=None,
) -> dict:
    """Visit a neighbor blog and perform the requested engagement actions.

    Parameters
    ----------
    account : dict
        Must contain keys: ``id``, ``account_name``, ``naver_id``,
        ``naver_password``.
    blog_url : str
        Full URL of the blog post to visit.
    actions : dict
        ``{"like": bool, "comment": str | None}``.
    progress_callback : callable | None
        Optional async/sync callback invoked with status strings.

    Returns
    -------
    dict
        ``{ "success": bool, "liked": bool, "commented": bool,
           "error": str | None }``
    """
    result = {"success": False, "liked": False, "commented": False, "error": None}

    browser = None
    try:
        pw = await async_playwright().start()
        browser, context = await create_stealth_context(pw)

        if progress_callback:
            msg = f"Logging in as {account.get('account_name', account['naver_id'])}..."
            if asyncio.iscoroutinefunction(progress_callback):
                await progress_callback(msg)
            else:
                progress_callback(msg)

        logged_in = await login(
            context,
            naver_id=account["naver_id"],
            naver_password=account["naver_password"],
            account_id=account.get("id"),
        )

        if not logged_in:
            result["error"] = "Login failed"
            logger.error(f"Login failed for account '{account.get('id')}'")
            return result

        page = await context.new_page()

        if progress_callback:
            msg = f"Navigating to {blog_url}"
            if asyncio.iscoroutinefunction(progress_callback):
                await progress_callback(msg)
            else:
                progress_callback(msg)

        await page.goto(blog_url, wait_until="domcontentloaded", timeout=30000)
        await random_delay(2.0, 4.0)

        # --- Like ---
        if actions.get("like"):
            if progress_callback:
                msg = "Clicking like button..."
                if asyncio.iscoroutinefunction(progress_callback):
                    await progress_callback(msg)
                else:
                    progress_callback(msg)

            result["liked"] = await click_like(page)

        # --- Comment ---
        comment_text = actions.get("comment")
        if isinstance(comment_text, str) and comment_text.strip():
            if progress_callback:
                msg = "Posting comment..."
                if asyncio.iscoroutinefunction(progress_callback):
                    await progress_callback(msg)
                else:
                    progress_callback(msg)

            result["commented"] = await write_comment(page, comment_text)

        result["success"] = True
        logger.info(
            f"Engagement complete for {blog_url} – "
            f"liked={result['liked']}, commented={result['commented']}"
        )

    except Exception as exc:
        result["error"] = str(exc)
        logger.error(f"Engagement failed for {blog_url}: {exc}")
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass

    return result


# ---------------------------------------------------------------------------
# Neighbor feed crawler
# ---------------------------------------------------------------------------

FEED_URLS = [
    "https://section.blog.naver.com/BlogHome.naver?directoryNo=0&currentPage=1",
    "https://blog.naver.com/FeedList.naver",
]

POST_LINK_SELECTORS = [
    "a.desc_inner",
    "a.link_end",
    ".list_post_article a.desc_inner",
    ".buddy_feed_list a.url",
    'a[href*="blog.naver.com/"]',
    'a[href*="PostView.naver"]',
    'a[href*="PostList.naver"]',
]

POST_TITLE_SELECTORS = [
    ".title_feed",
    ".title_post",
    ".desc_inner .title",
    "strong.tit",
    ".tit_feed",
    "span.ell",
]

BLOG_NAME_SELECTORS = [
    ".nickname",
    ".writer_info .name",
    ".author_nickname",
    ".blog_name",
    "a.link_author",
    ".buddy_name",
]

TIME_SELECTORS = [
    ".time",
    ".date",
    "span.time",
    "span.date",
    ".publish_date",
]


async def crawl_neighbor_feed(account: dict, max_posts: int = 20) -> list:
    """Crawl the Naver neighbor/buddy blog feed and return post metadata.

    Parameters
    ----------
    account : dict
        Must contain ``naver_id``, ``naver_password``, and optionally ``id``.
    max_posts : int
        Maximum number of posts to extract (default 20).

    Returns
    -------
    list[dict]
        Each entry: ``{ "id": str, "blogName": str, "title": str,
        "url": str, "timeAgo": str }``.
        Returns an empty list if crawling fails.
    """
    browser = None
    posts: list[dict] = []

    try:
        pw = await async_playwright().start()
        browser, context = await create_stealth_context(pw)

        logged_in = await login(
            context,
            naver_id=account["naver_id"],
            naver_password=account["naver_password"],
            account_id=account.get("id"),
        )

        if not logged_in:
            logger.error("Cannot crawl neighbor feed – login failed")
            return posts

        page = await context.new_page()

        # Try each feed URL until one works
        feed_loaded = False
        for feed_url in FEED_URLS:
            try:
                logger.info(f"Attempting to load feed: {feed_url}")
                await page.goto(feed_url, wait_until="domcontentloaded", timeout=20000)
                await random_delay(2.0, 4.0)
                feed_loaded = True
                break
            except Exception as exc:
                logger.warning(f"Failed to load feed URL {feed_url}: {exc}")

        if not feed_loaded:
            logger.error("Could not load any feed URL")
            return posts

        # Scroll down a bit to trigger lazy-loaded content
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, 600)")
            await random_delay(0.8, 1.5)

        # Extract post links
        link_elements = []
        for selector in POST_LINK_SELECTORS:
            try:
                elements = await page.query_selector_all(selector)
                if elements:
                    link_elements = elements
                    logger.debug(f"Found {len(elements)} links with selector '{selector}'")
                    break
            except Exception:
                continue

        if not link_elements:
            logger.warning("No post links found in feed")
            await capture_debug(page, "feed_no_links")
            return posts

        seen_urls: set[str] = set()

        for i, link_el in enumerate(link_elements):
            if len(posts) >= max_posts:
                break

            try:
                href = await link_el.get_attribute("href") or ""
                if not href or href in seen_urls:
                    continue

                # Normalise relative URLs
                if href.startswith("/"):
                    href = f"https://blog.naver.com{href}"

                seen_urls.add(href)

                # Try to get the title from within the link element or nearby
                title = ""
                try:
                    title_el = await link_el.query_selector(
                        ", ".join(POST_TITLE_SELECTORS)
                    )
                    if title_el:
                        title = (await title_el.inner_text()).strip()
                except Exception:
                    pass
                if not title:
                    try:
                        title = (await link_el.inner_text()).strip()
                    except Exception:
                        title = ""
                # Truncate very long titles
                if len(title) > 120:
                    title = title[:117] + "..."

                # Try to find blog name and time from a parent container
                parent = link_el
                blog_name = ""
                time_ago = ""
                try:
                    parent = await link_el.evaluate_handle(
                        "el => el.closest('li') || el.closest('div.item') "
                        "|| el.closest('article') || el.parentElement"
                    )
                except Exception:
                    pass

                if parent:
                    for sel in BLOG_NAME_SELECTORS:
                        try:
                            name_el = await parent.query_selector(sel)
                            if name_el:
                                blog_name = (await name_el.inner_text()).strip()
                                break
                        except Exception:
                            continue

                    for sel in TIME_SELECTORS:
                        try:
                            time_el = await parent.query_selector(sel)
                            if time_el:
                                time_ago = (await time_el.inner_text()).strip()
                                break
                        except Exception:
                            continue

                # Build a stable-ish id from the URL
                post_id = re.sub(r"[^a-zA-Z0-9]", "_", href)[-64:]

                posts.append(
                    {
                        "id": post_id,
                        "blogName": blog_name or "Unknown",
                        "title": title or "(untitled)",
                        "url": href,
                        "timeAgo": time_ago or "",
                    }
                )

            except Exception as exc:
                logger.debug(f"Failed to extract post #{i}: {exc}")
                continue

        logger.info(f"Crawled {len(posts)} posts from neighbor feed")

    except Exception as exc:
        logger.error(f"Neighbor feed crawl failed: {exc}")
    finally:
        if browser:
            try:
                await browser.close()
            except Exception:
                pass

    return posts
