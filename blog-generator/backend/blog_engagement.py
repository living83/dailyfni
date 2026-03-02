"""
네이버 블로그 공감(좋아요) + AI 댓글 자동화
- 블로그 피드에서 포스팅 수집
- 각 포스팅에 공감 클릭 + Claude AI 댓글 작성
- 등록된 계정으로 하루 1회 자동 실행
"""

import os
import sys
import asyncio
import random
import logging
import anthropic
from se_helpers import (
    create_stealth_context,
    login,
    random_delay,
    try_selectors,
    capture_debug,
    _run_in_proactor_loop,
)

logger = logging.getLogger("engagement")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 블로그 피드에서 포스팅 수집
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def collect_blog_posts(page, max_posts: int = 10) -> list:
    """네이버 메인 → 블로그 → 주제별 보기 경로로 포스팅 URL 수집"""
    posts = []

    try:
        # ── 1단계: 네이버 메인에서 "블로그" 클릭 ──
        await page.goto("https://www.naver.com/",
                        wait_until="domcontentloaded", timeout=15000)
        await random_delay(2, 3)

        # 오른쪽 하단 영역의 "블로그" 링크 찾기
        blog_link = await try_selectors(page, [
            'a:has-text("블로그")[href*="blog"]',
            'a[href*="section.blog.naver.com"]',
            'a[href*="blog.naver.com"]:has-text("블로그")',
        ], timeout=5000, description="네이버 메인 블로그 링크")

        if not blog_link:
            # JS 폴백: 텍스트로 "블로그" 링크 찾기
            blog_link_handle = await page.evaluate_handle('''() => {
                const links = document.querySelectorAll('a');
                for (const a of links) {
                    const text = a.textContent.trim();
                    const href = a.href || '';
                    if (text === '블로그' && href.includes('blog')) return a;
                }
                return null;
            }''')
            el = blog_link_handle.as_element() if blog_link_handle else None
            if el:
                blog_link = el
                logger.info("네이버 메인 블로그 링크 JS 폴백 발견")

        if blog_link:
            await blog_link.click()
            await random_delay(2, 3)
            logger.info("네이버 메인 → 블로그 이동")
        else:
            # 직접 이동 폴백
            logger.warning("블로그 링크 미발견, 직접 이동")
            await page.goto("https://section.blog.naver.com/BlogHome.naver",
                            wait_until="domcontentloaded", timeout=15000)
            await random_delay(2, 3)

        # ── 2단계: "주제별 보기" 클릭 ──
        topic_link = await try_selectors(page, [
            'a:has-text("주제별 보기")',
            'a:has-text("주제별보기")',
            'a[href*="ThemePost"]',
            'a[href*="topic"]',
            '.category_area a:has-text("주제")',
            'nav a:has-text("주제")',
        ], timeout=5000, description="주제별 보기 링크")

        if not topic_link:
            # JS 폴백
            topic_handle = await page.evaluate_handle('''() => {
                const links = document.querySelectorAll('a');
                for (const a of links) {
                    const text = a.textContent.trim();
                    if (text.includes('주제별') && text.includes('보기')) return a;
                    if (text === '주제별 보기') return a;
                }
                return null;
            }''')
            el = topic_handle.as_element() if topic_handle else None
            if el:
                topic_link = el
                logger.info("주제별 보기 링크 JS 폴백 발견")

        if topic_link:
            await topic_link.click()
            await random_delay(2, 3)
            logger.info("주제별 보기 페이지 이동")
        else:
            logger.warning("주제별 보기 링크 미발견, 현재 페이지에서 포스팅 수집 시도")

        # ── 3단계: 포스팅 목록 수집 ──
        # 스크롤 다운으로 더 많은 포스팅 로드
        for _ in range(3):
            await page.evaluate('window.scrollBy(0, 800)')
            await random_delay(0.5, 1.0)

        posts = await page.evaluate(f'''() => {{
            const results = [];

            // 포스팅 URL 검증
            function isPostUrl(url) {{
                if (!url || !url.includes('blog.naver.com')) return false;
                if (url.includes('seller.blog.naver.com')) return false;
                if (url.includes('section.blog.naver.com')) return false;
                if (url.includes('/PostView.naver')) return true;
                if (url.includes('/PostList.naver')) return false;
                if (url.includes('/BlogHome')) return false;
                if (url.includes('/my-log')) return false;
                if (url.includes('/market')) return false;
                const match = url.match(/blog\\.naver\\.com\\/([^\\/\\?]+)\\/([0-9]+)/);
                if (match) return true;
                return false;
            }}

            // 주제별 보기 포스팅 링크 수집 (다양한 셀렉터)
            const selectors = [
                '.desc_inner a.desc_txt',
                '.post_area a.desc_txt',
                '.list_post_article a.desc_txt',
                'a.desc_txt[href*="blog.naver.com"]',
                '.item_inner a[href*="blog.naver.com"]',
                'a[href*="/PostView.naver"]',
                'a[href*="blog.naver.com"][class*="link"]',
                // 주제별 보기 전용 셀렉터
                '.theme_post_area a[href*="blog.naver.com"]',
                '.topic_post a[href*="blog.naver.com"]',
                '.post_list a[href*="blog.naver.com"]',
                '.content_list a[href*="blog.naver.com"]',
                '.list_content a[href*="blog.naver.com"]',
            ];

            for (const sel of selectors) {{
                const links = document.querySelectorAll(sel);
                for (const link of links) {{
                    const href = link.href || link.getAttribute('href') || '';
                    const title = (link.textContent || '').trim().substring(0, 100);
                    if (isPostUrl(href) && title && title.length > 3 &&
                        !results.some(r => r.url === href)) {{
                        results.push({{ url: href, title: title }});
                    }}
                    if (results.length >= {max_posts}) break;
                }}
                if (results.length >= {max_posts}) break;
            }}

            // 폴백: 모든 블로그 링크 중 포스팅 URL만 수집
            if (results.length === 0) {{
                const allLinks = document.querySelectorAll('a[href*="blog.naver.com"]');
                for (const link of allLinks) {{
                    const href = link.href || '';
                    const title = (link.textContent || '').trim().substring(0, 100);
                    if (isPostUrl(href) && title && title.length > 5 &&
                        !results.some(r => r.url === href)) {{
                        results.push({{ url: href, title: title }});
                    }}
                    if (results.length >= {max_posts}) break;
                }}
            }}

            return results;
        }}''')

        logger.info(f"주제별 보기에서 포스팅 {len(posts)}개 수집")

    except Exception as e:
        logger.error(f"블로그 포스팅 수집 실패: {e}")

    return posts


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 포스팅 내용 읽기
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def read_post_content(page, post_url: str) -> dict:
    """블로그 포스팅 내용 추출"""
    result = {"title": "", "content": "", "error": ""}

    try:
        await page.goto(post_url, wait_until="domcontentloaded", timeout=15000)
        await random_delay(2, 3)

        # 네이버 블로그는 iframe 안에 본문이 있음
        content_data = await page.evaluate('''() => {
            let title = '';
            let content = '';

            // 제목 추출
            const titleEls = document.querySelectorAll(
                '.se-title-text, .pcol1, .htitle, .se-fs-, h3.se_textarea, ' +
                '[class*="title"] span, .post-title'
            );
            for (const el of titleEls) {
                const t = el.textContent.trim();
                if (t && t.length > 3) { title = t; break; }
            }

            // 본문 추출
            const contentEls = document.querySelectorAll(
                '.se-main-container, .se-component.se-text, ' +
                '#postViewArea, #post-view, .post_ct'
            );
            for (const el of contentEls) {
                const t = el.innerText.trim();
                if (t && t.length > 20) { content = t; break; }
            }

            return { title, content };
        }''')

        # iframe 내부에서도 시도 (mainFrame 우선)
        if not content_data.get("content"):
            # mainFrame을 우선 탐색
            sorted_frames = sorted(
                page.frames,
                key=lambda f: (0 if 'mainFrame' in (f.name or '') else 1),
            )
            for frame in sorted_frames:
                if frame == page.main_frame:
                    continue  # 이미 위에서 시도함
                try:
                    frame_data = await frame.evaluate('''() => {
                        let title = '';
                        let content = '';

                        const titleEls = document.querySelectorAll(
                            '.se-title-text, .pcol1, h3.se_textarea, ' +
                            '[class*="title"] span, .se-fs-, .tit_h3'
                        );
                        for (const el of titleEls) {
                            const t = el.textContent.trim();
                            if (t && t.length > 3) { title = t; break; }
                        }

                        const contentEls = document.querySelectorAll(
                            '.se-main-container, #postViewArea, .post_ct, ' +
                            '.se-component.se-text, #post-view'
                        );
                        for (const el of contentEls) {
                            const t = el.innerText.trim();
                            if (t && t.length > 20) { content = t; break; }
                        }

                        return { title, content };
                    }''')

                    if frame_data.get("content"):
                        content_data = frame_data
                        break
                except Exception:
                    continue

        result["title"] = content_data.get("title", "")
        # 본문을 최대 2000자로 제한 (AI 댓글 생성용)
        result["content"] = (content_data.get("content", ""))[:2000]

        if not result["content"]:
            result["error"] = "본문 추출 실패"

    except Exception as e:
        result["error"] = str(e)

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 공감(좋아요) 클릭
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def click_like(page) -> dict:
    """현재 페이지의 공감(하트) 버튼 클릭"""
    result = {"success": False, "already_liked": False, "error": ""}

    try:
        # iframe 내부에서 공감 버튼 찾기 (네이버 블로그는 iframe 구조)
        like_target = page
        for frame in page.frames:
            try:
                has_like = await frame.evaluate('''() => {
                    return !!document.querySelector(
                        '.u_likeit_btn, [class*="sympathy"], [class*="like_it"], ' +
                        'a[class*="btn_like"], .btn_sympathize, [data-type="sympathy"]'
                    );
                }''')
                if has_like:
                    like_target = frame
                    break
            except Exception:
                continue

        # 공감 영역으로 스크롤 (iframe 내부에서 스크롤)
        await like_target.evaluate('''() => {
            const btn = document.querySelector(
                '.u_likeit_btn, [class*="sympathy"], [class*="like_it"], ' +
                '.btn_sympathize, [data-type="sympathy"]'
            );
            if (btn) btn.scrollIntoView({ block: "center", behavior: "smooth" });
            else window.scrollTo(0, document.body.scrollHeight);
        }''')
        await random_delay(1, 2)

        # 이미 공감 눌렀는지 확인
        already_liked = await like_target.evaluate('''() => {
            const btn = document.querySelector(
                '.u_likeit_btn, [class*="sympathy"], [class*="like_it"], ' +
                '.btn_sympathize'
            );
            if (!btn) return false;
            return btn.classList.contains('on') ||
                   btn.classList.contains('is_active') ||
                   btn.getAttribute('data-active') === 'true';
        }''')

        if already_liked:
            result["already_liked"] = True
            result["success"] = True
            logger.info("이미 공감한 글입니다")
            return result

        # 공감 버튼 클릭
        like_btn = await try_selectors(like_target, [
            '.u_likeit_btn:not(.on)',
            'a.u_likeit_btn',
            '.btn_sympathize',
            '[class*="sympathy"] button',
            '[class*="like_it"] button',
            'button[data-type="sympathy"]',
            'a[class*="btn_like"]',
        ], timeout=5000, description="공감 버튼")

        if like_btn:
            # 클릭 전 viewport 내로 스크롤
            await like_btn.scroll_into_view_if_needed()
            await random_delay(0.3, 0.5)
            try:
                await like_btn.click(timeout=5000)
            except Exception:
                # viewport 밖 등 클릭 실패 시 JS로 직접 클릭
                await like_target.evaluate('''(el) => { el.click(); }''', like_btn)
            await random_delay(1, 2)
            result["success"] = True
            logger.info("공감 클릭 성공")
            return result

        # JS 폴백
        clicked = await like_target.evaluate('''() => {
            const selectors = [
                '.u_likeit_btn', '.btn_sympathize',
                '[class*="sympathy"] button', '[class*="like_it"] a',
                'a[class*="btn_like"]'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    el.scrollIntoView({ block: "center" });
                    el.click();
                    return true;
                }
            }
            return false;
        }''')
        if clicked:
            result["success"] = True
            logger.info("공감 클릭 성공 (JS 폴백)")
            await random_delay(1, 2)
            return result

        result["error"] = "공감 버튼 미발견"

    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"공감 클릭 실패: {e}")

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# AI 댓글 생성
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def generate_comment(api_key: str, post_title: str, post_content: str) -> str:
    """Claude AI를 사용해 블로그 포스팅에 맞는 짧은 댓글 생성"""
    try:
        client = anthropic.Anthropic(api_key=api_key)

        prompt = f"""다음 네이버 블로그 글을 읽고, 일반 독자로서 자연스럽고 짧은 댓글을 한국어로 작성해주세요.

규칙:
- 1~2문장으로 짧게 (30~80자)
- 글 내용에 대한 구체적인 반응 (공감, 질문, 감사 등)
- 자연스러운 블로그 댓글 어투 (~요, ~네요, ~합니다 등 자연스럽게 섞어서)
- 광고성/스팸성 표현 절대 금지
- 이모지 0~1개만 사용
- "좋은 글이네요" 같은 뻔한 표현 대신, 글 내용의 특정 부분에 반응

블로그 글 제목: {post_title}

블로그 글 내용 (일부):
{post_content[:1500]}

댓글 (한 줄만 출력):"""

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )

        comment = message.content[0].text.strip()
        # 따옴표 제거 (AI가 종종 따옴표로 감싸는 경우)
        comment = comment.strip('"').strip("'").strip('"').strip('"')
        # 줄바꿈이 있으면 첫 줄만
        comment = comment.split("\n")[0].strip()

        logger.info(f"AI 댓글 생성: {comment[:50]}...")
        return comment

    except Exception as e:
        logger.error(f"AI 댓글 생성 실패: {e}")
        return ""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 댓글 작성
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def write_comment(page, comment_text: str) -> dict:
    """현재 페이지에 댓글 작성"""
    result = {"success": False, "error": ""}

    if not comment_text:
        result["error"] = "댓글 내용 없음"
        return result

    try:
        # iframe 내부에서 댓글 입력 영역 찾기
        comment_target = page
        for frame in page.frames:
            try:
                has_comment = await frame.evaluate('''() => {
                    return !!document.querySelector(
                        '.u_cbox_write_wrap, [class*="comment_write"], ' +
                        '[class*="reply_write"], textarea[class*="comment"], ' +
                        '.comment_inbox, .u_cbox_area'
                    );
                }''')
                if has_comment:
                    comment_target = frame
                    break
            except Exception:
                continue

        # 댓글 영역으로 스크롤
        await comment_target.evaluate('''() => {
            const area = document.querySelector(
                '.u_cbox_write_wrap, .u_cbox_area, [class*="comment_write"], .comment_inbox'
            );
            if (area) area.scrollIntoView({ block: "center", behavior: "smooth" });
            else window.scrollTo(0, document.body.scrollHeight);
        }''')
        await random_delay(1, 2)

        # 댓글 입력 영역 클릭 (포커스) - 클릭 가능한 placeholder 포함
        comment_input = await try_selectors(comment_target, [
            '.u_cbox_write_wrap textarea',
            'textarea.u_cbox_text',
            '.u_cbox_text',
            'textarea[class*="comment"]',
            '[class*="comment_write"] textarea',
            '.comment_inbox textarea',
            'textarea[placeholder*="댓글"]',
            '.u_cbox_write_wrap .u_cbox_inbox',
            '.u_cbox_inbox',
        ], timeout=5000, description="댓글 입력 영역")

        if not comment_input:
            # JS 폴백: 댓글 placeholder 클릭하여 textarea 활성화
            activated = await comment_target.evaluate('''() => {
                // placeholder 영역 클릭으로 textarea 활성화
                const placeholders = document.querySelectorAll(
                    '.u_cbox_inbox, .u_cbox_write_wrap, ' +
                    '[class*="comment_write"], .comment_inbox'
                );
                for (const ph of placeholders) {
                    ph.click();
                    const ta = ph.querySelector('textarea');
                    if (ta) { ta.click(); ta.focus(); return "textarea"; }
                    // contenteditable div인 경우
                    const editable = ph.querySelector('[contenteditable="true"]');
                    if (editable) { editable.click(); editable.focus(); return "editable"; }
                    return "clicked";
                }
                return "";
            }''')

            if activated:
                await random_delay(0.5, 1)
                comment_input = await try_selectors(comment_target, [
                    'textarea:focus', 'textarea.u_cbox_text',
                    'textarea[class*="comment"]',
                    '[contenteditable="true"]:focus',
                ], timeout=3000, description="댓글 입력(포커스 후)")

        if not comment_input:
            result["error"] = "댓글 입력 영역 미발견"
            return result

        await comment_input.click()
        await random_delay(0.5, 1)

        # 댓글 타이핑 (자연스러운 속도)
        # contenteditable인 경우에도 type()이 동작함
        await comment_input.type(comment_text,
                                 delay=50 + random.randint(-15, 25))
        await random_delay(1, 2)

        # 등록 버튼 클릭
        submit_btn = await try_selectors(comment_target, [
            'button.u_cbox_btn_upload',
            'a.u_cbox_btn_upload',
            '.u_cbox_btn_upload',
            'button:has-text("등록")',
            'a:has-text("등록")',
            '[class*="comment"] button[class*="submit"]',
            '[class*="comment"] button[class*="upload"]',
            'button[class*="btn_register"]',
        ], timeout=5000, description="댓글 등록 버튼")

        if not submit_btn:
            # JS 폴백
            clicked = await comment_target.evaluate('''() => {
                const btns = document.querySelectorAll('button, a');
                for (const btn of btns) {
                    const text = (btn.textContent || '').trim();
                    const cls = btn.className || '';
                    if (text === '등록' || cls.includes('upload') ||
                        cls.includes('submit') || cls.includes('btn_register')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            }''')
            if clicked:
                result["success"] = True
                logger.info("댓글 등록 성공 (JS 폴백)")
                await random_delay(2, 3)
                return result

            result["error"] = "댓글 등록 버튼 미발견"
            return result

        await submit_btn.click()
        await random_delay(2, 3)
        result["success"] = True
        logger.info("댓글 등록 성공")

    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"댓글 작성 실패: {e}")

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 단일 포스팅 참여 (공감 + 댓글)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def engage_single_post(page, post_url: str, api_key: str = "",
                             do_like: bool = True, do_comment: bool = True) -> dict:
    """단일 포스팅에 공감 + 댓글 작성"""
    result = {
        "post_url": post_url,
        "post_title": "",
        "like_success": False,
        "comment_success": False,
        "comment_text": "",
        "error": "",
    }

    try:
        # 1. 포스팅 내용 읽기
        post_data = await read_post_content(page, post_url)
        result["post_title"] = post_data.get("title", "")

        if post_data.get("error"):
            logger.warning(f"본문 추출 실패: {post_data['error']} (URL: {post_url})")

        # 2. 공감 클릭
        if do_like:
            like_result = await click_like(page)
            result["like_success"] = like_result["success"]
            if like_result.get("already_liked"):
                logger.info(f"이미 공감: {result['post_title'][:30]}")

        # 3. AI 댓글 생성 + 작성
        if do_comment and api_key and post_data.get("content"):
            comment_text = generate_comment(
                api_key,
                post_data.get("title", ""),
                post_data.get("content", ""),
            )
            result["comment_text"] = comment_text

            if comment_text:
                comment_result = await write_comment(page, comment_text)
                result["comment_success"] = comment_result["success"]
                if comment_result.get("error"):
                    result["error"] = comment_result["error"]
            else:
                result["error"] = "AI 댓글 생성 실패"
        elif do_comment and not api_key:
            result["error"] = "API 키 미설정 (댓글 건너뜀)"

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"포스팅 참여 실패: {e}")

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 전체 참여 실행 (계정 1개)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _run_engagement_impl(
    account_id: int,
    naver_id: str,
    naver_password: str,
    api_key: str = "",
    max_posts: int = 10,
    do_like: bool = True,
    do_comment: bool = True,
) -> dict:
    """단일 계정으로 블로그 참여 실행"""
    from playwright.async_api import async_playwright

    result = {
        "account_id": account_id,
        "total_posts": 0,
        "like_count": 0,
        "comment_count": 0,
        "results": [],
        "error": "",
    }

    async with async_playwright() as p:
        browser, context = await create_stealth_context(p)
        page = await context.new_page()

        try:
            # 1. 로그인
            logged_in = await login(page, account_id, naver_id, naver_password)
            if not logged_in:
                result["error"] = "로그인 실패"
                return result

            await random_delay(2, 3)

            # 2. 블로그 피드에서 포스팅 수집
            posts = await collect_blog_posts(page, max_posts)
            if not posts:
                result["error"] = "블로그 피드에서 포스팅을 찾을 수 없습니다"
                return result

            result["total_posts"] = len(posts)
            logger.info(f"참여 시작: 계정 {account_id}, 포스팅 {len(posts)}개")

            # 3. 각 포스팅에 참여
            for i, post in enumerate(posts):
                logger.info(f"[{i+1}/{len(posts)}] {post.get('title', '?')[:40]}...")

                engage_result = await engage_single_post(
                    page, post["url"], api_key,
                    do_like=do_like, do_comment=do_comment,
                )
                result["results"].append(engage_result)

                if engage_result["like_success"]:
                    result["like_count"] += 1
                if engage_result["comment_success"]:
                    result["comment_count"] += 1

                # 포스팅 간 자연스러운 대기 (30~90초)
                if i < len(posts) - 1:
                    delay = random.uniform(30, 90)
                    logger.info(f"다음 포스팅까지 {delay:.0f}초 대기")
                    await asyncio.sleep(delay)

            logger.info(
                f"참여 완료: 계정 {account_id}, "
                f"공감 {result['like_count']}/{result['total_posts']}, "
                f"댓글 {result['comment_count']}/{result['total_posts']}"
            )

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"참여 실행 중 오류: {e}")
            await capture_debug(page, "engagement_error")
        finally:
            await browser.close()

    return result


async def run_engagement(
    account_id: int,
    naver_id: str,
    naver_password: str,
    api_key: str = "",
    max_posts: int = 10,
    do_like: bool = True,
    do_comment: bool = True,
) -> dict:
    """참여 실행 (Windows ProactorEventLoop 호환)"""
    if sys.platform == "win32":
        return await asyncio.to_thread(
            _run_in_proactor_loop, _run_engagement_impl,
            account_id, naver_id, naver_password,
            api_key, max_posts, do_like, do_comment,
        )
    return await _run_engagement_impl(
        account_id, naver_id, naver_password,
        api_key, max_posts, do_like, do_comment,
    )
