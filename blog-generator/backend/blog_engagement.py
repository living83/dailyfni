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
        # ── 1단계: 네이버 메인에서 "블로그" 링크 URL 추출 후 이동 ──
        await page.goto("https://www.naver.com/",
                        wait_until="domcontentloaded", timeout=15000)
        await random_delay(1, 2)

        # 상단 네비게이션의 "블로그" 링크 URL 추출 (클릭 대신 URL 추출 → goto)
        # 클릭하면 target="_blank"로 새 탭이 열릴 수 있어서 URL을 직접 가져옴
        blog_url = await page.evaluate('''() => {
            const links = document.querySelectorAll('a');
            for (const a of links) {
                const text = (a.textContent || '').trim();
                const href = a.href || '';
                // 상단 네비게이션의 "블로그" 링크
                if (text === '블로그' && href.includes('blog')) return href;
            }
            // 두 번째 시도: href에 blog이 포함된 링크
            for (const a of links) {
                const text = (a.textContent || '').trim();
                const href = a.href || '';
                if (text.includes('블로그') && (
                    href.includes('section.blog.naver.com') ||
                    href.includes('blog.naver.com')
                )) return href;
            }
            return '';
        }''')

        if blog_url:
            logger.info(f"네이버 메인 → 블로그: {blog_url}")
            await page.goto(blog_url, wait_until="domcontentloaded", timeout=15000)
            await random_delay(1, 2)
        else:
            logger.warning("블로그 링크 미발견, 블로그 섹션으로 직접 이동")
            await page.goto("https://section.blog.naver.com/BlogHome.naver",
                            wait_until="domcontentloaded", timeout=15000)
            await random_delay(1, 2)

        logger.info(f"블로그 페이지 도착: {page.url}")

        # ── 2단계: "주제별 보기" 링크 URL 추출 후 이동 ──
        topic_url = await page.evaluate('''() => {
            const links = document.querySelectorAll('a');
            for (const a of links) {
                const text = (a.textContent || '').trim();
                const href = a.href || '';
                if (text === '주제별 보기' || text === '주제별보기') return href;
                if (text.includes('주제별') && text.includes('보기')) return href;
            }
            // href 기반 탐색
            for (const a of links) {
                const href = a.href || '';
                if (href.includes('ThemePost')) return href;
            }
            return '';
        }''')

        if topic_url:
            logger.info(f"주제별 보기 이동: {topic_url}")
            await page.goto(topic_url, wait_until="domcontentloaded", timeout=15000)
            await random_delay(1, 2)
        else:
            # 직접 URL 폴백
            logger.warning("주제별 보기 링크 미발견 → 직접 URL 이동")
            await page.goto("https://section.blog.naver.com/ThemePost.naver",
                            wait_until="domcontentloaded", timeout=15000)
            await random_delay(1, 2)

        logger.info(f"주제별 보기 도착: {page.url}")

        # ── 3단계: 포스팅 목록 수집 ──
        # 스크롤 다운으로 더 많은 포스팅 로드
        for _ in range(5):
            await page.evaluate('window.scrollBy(0, 600)')
            await random_delay(0.3, 0.6)

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

        # 포스팅 없으면 디버그 정보
        if not posts:
            page_info = await page.evaluate('''() => {
                return {
                    url: location.href,
                    title: document.title,
                    links: document.querySelectorAll('a[href*="blog.naver.com"]').length,
                    allLinks: document.querySelectorAll('a').length,
                };
            }''')
            logger.warning(f"포스팅 0개 - 페이지 정보: {page_info}")
            await capture_debug(page, "no_posts_found")

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
        await random_delay(1, 2)

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
        await random_delay(0.5, 1)

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
            await random_delay(0.2, 0.3)
            try:
                await like_btn.click(timeout=5000)
            except Exception:
                # viewport 밖 등 클릭 실패 시 JS로 직접 클릭
                await like_target.evaluate('''(el) => { el.click(); }''', like_btn)
            await random_delay(0.5, 1)
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
            await random_delay(0.5, 1)
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
        # ── 1. 메인 페이지 하단까지 스크롤 (댓글 iframe 로딩 트리거) ──
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await random_delay(1, 2)
        # 추가 스크롤로 댓글 영역 확실히 로딩
        for _ in range(3):
            await page.evaluate('window.scrollBy(0, 500)')
            await random_delay(0.3, 0.5)

        # ── 2. 댓글 iframe 찾기 ──
        comment_target = None

        # 방법 1: iframe URL/이름으로 찾기 (가장 정확)
        for frame in page.frames:
            frame_url = frame.url or ''
            frame_name = frame.name or ''
            if ('cbox' in frame_url.lower() or 'comment' in frame_url.lower() or
                'cbox' in frame_name.lower() or 'comment' in frame_name.lower()):
                comment_target = frame
                logger.info(f"댓글 iframe 발견 (URL매칭): name={frame_name}, url={frame_url[:80]}")
                break

        # 방법 2: DOM 내용으로 찾기
        if not comment_target:
            for frame in page.frames:
                if frame == page.main_frame:
                    continue
                try:
                    has_cbox = await frame.evaluate('''() => {
                        return !!document.querySelector(
                            '.u_cbox_wrap, .u_cbox_area, .u_cbox_write_wrap, ' +
                            '[class*="u_cbox"], .cbox_module'
                        );
                    }''')
                    if has_cbox:
                        comment_target = frame
                        logger.info(f"댓글 프레임 발견 (DOM매칭): name={frame.name}")
                        break
                except Exception:
                    continue

        # 방법 3: mainFrame 내부에서 시도 (일부 블로그는 post + 댓글이 같은 iframe)
        if not comment_target:
            for frame in page.frames:
                if frame == page.main_frame:
                    continue
                try:
                    has_textarea = await frame.evaluate('''() => {
                        const ta = document.querySelector('textarea');
                        return !!ta;
                    }''')
                    if has_textarea:
                        comment_target = frame
                        logger.info(f"textarea 포함 프레임 발견: name={frame.name}")
                        break
                except Exception:
                    continue

        if not comment_target:
            # 메인 페이지에서도 시도
            comment_target = page
            logger.warning("댓글 iframe 미발견, 메인 페이지에서 시도")

        # ── 3. 댓글 영역으로 스크롤 + placeholder 클릭 (textarea 활성화) ──
        await comment_target.evaluate('''() => {
            // 댓글 작성 영역 스크롤
            const area = document.querySelector(
                '.u_cbox_write_wrap, .u_cbox_area, .u_cbox_inbox'
            );
            if (area) {
                area.scrollIntoView({ block: "center" });
            } else {
                window.scrollTo(0, document.body.scrollHeight);
            }
        }''')
        await random_delay(0.5, 1)

        # placeholder/inbox 클릭으로 textarea 활성화
        await comment_target.evaluate('''() => {
            const clickTargets = document.querySelectorAll(
                '.u_cbox_inbox, .u_cbox_write_wrap, .u_cbox_write_box, ' +
                '.u_cbox_placeholder'
            );
            for (const el of clickTargets) {
                el.click();
            }
        }''')
        await random_delay(0.5, 1)

        # ── 4. textarea 찾기 ──
        comment_input = await try_selectors(comment_target, [
            'textarea.u_cbox_text',
            '.u_cbox_write_wrap textarea',
            'textarea[class*="u_cbox"]',
            '.u_cbox_inbox textarea',
            'textarea[placeholder*="댓글"]',
            'textarea',
        ], timeout=5000, description="댓글 textarea")

        if not comment_input:
            # 재시도: placeholder 다시 클릭 + focus
            activated = await comment_target.evaluate('''() => {
                // 모든 댓글 관련 영역 클릭
                const areas = document.querySelectorAll(
                    '.u_cbox_inbox, .u_cbox_write_box, .u_cbox_write_wrap, ' +
                    '.u_cbox_placeholder, [class*="comment_write"]'
                );
                for (const area of areas) {
                    area.click();
                }
                // textarea 직접 찾아서 focus
                const ta = document.querySelector(
                    'textarea.u_cbox_text, textarea[class*="u_cbox"], textarea'
                );
                if (ta) {
                    ta.click();
                    ta.focus();
                    return true;
                }
                // contenteditable div 시도
                const editable = document.querySelector('[contenteditable="true"]');
                if (editable) {
                    editable.click();
                    editable.focus();
                    return true;
                }
                return false;
            }''')

            if activated:
                await random_delay(0.3, 0.5)
                comment_input = await try_selectors(comment_target, [
                    'textarea:focus',
                    'textarea.u_cbox_text',
                    'textarea',
                    '[contenteditable="true"]:focus',
                ], timeout=3000, description="댓글 textarea(재시도)")

        if not comment_input:
            # 디버그: 모든 프레임 정보 로깅
            frame_info = []
            for f in page.frames:
                try:
                    f_url = f.url or 'none'
                    f_name = f.name or 'unnamed'
                    el_count = await f.evaluate('document.querySelectorAll("*").length')
                    has_ta = await f.evaluate('!!document.querySelector("textarea")')
                    has_cbox = await f.evaluate('!!document.querySelector("[class*=u_cbox]")')
                    frame_info.append(
                        f"[{f_name}] url={f_url[:60]} els={el_count} "
                        f"textarea={has_ta} cbox={has_cbox}"
                    )
                except Exception:
                    frame_info.append(f"[{f.name or '?'}] (접근불가)")
            logger.warning(f"댓글 입력 영역 미발견. 프레임 목록:\n" + "\n".join(frame_info))
            await capture_debug(page, "comment_not_found")
            result["error"] = "댓글 입력 영역 미발견"
            return result

        # ── 5. 댓글 타이핑 ──
        await comment_input.click()
        await random_delay(0.3, 0.5)
        await comment_input.type(comment_text,
                                 delay=30 + random.randint(-10, 15))
        await random_delay(0.5, 1)

        # ── 6. 등록 버튼 클릭 ──
        submit_btn = await try_selectors(comment_target, [
            'button.u_cbox_btn_upload',
            'a.u_cbox_btn_upload',
            '.u_cbox_btn_upload',
            'button:has-text("등록")',
            'a:has-text("등록")',
        ], timeout=5000, description="댓글 등록 버튼")

        if submit_btn:
            await submit_btn.click()
            await random_delay(1, 1.5)
            result["success"] = True
            logger.info("댓글 등록 성공")
        else:
            # JS 폴백
            clicked = await comment_target.evaluate('''() => {
                const btns = document.querySelectorAll('button, a');
                for (const btn of btns) {
                    const text = (btn.textContent || '').trim();
                    const cls = btn.className || '';
                    if (text === '등록' || cls.includes('upload') ||
                        cls.includes('btn_register')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            }''')
            if clicked:
                result["success"] = True
                logger.info("댓글 등록 성공 (JS 폴백)")
                await random_delay(1, 1.5)
            else:
                result["error"] = "댓글 등록 버튼 미발견"

    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"댓글 작성 실패: {e}")

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 단일 포스팅 참여 (공감 + 댓글)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def engage_single_post(page, post_url: str, api_key: str = "",
                             do_like: bool = True, do_comment: bool = True) -> dict:
    """단일 포스팅에 공감 + 댓글 작성 (공감과 AI 댓글 생성 병렬 처리)"""
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

        # 2. 공감 클릭 + AI 댓글 생성을 병렬 실행
        #    공감 클릭(~2초)하는 동안 AI 댓글(~3-5초)을 백그라운드에서 생성
        comment_future = None
        if do_comment and api_key and post_data.get("content"):
            comment_future = asyncio.get_event_loop().run_in_executor(
                None, generate_comment, api_key,
                post_data.get("title", ""), post_data.get("content", ""),
            )

        if do_like:
            like_result = await click_like(page)
            result["like_success"] = like_result["success"]
            if like_result.get("already_liked"):
                logger.info(f"이미 공감: {result['post_title'][:30]}")

        # 3. 댓글 생성 완료 대기 + 작성
        if comment_future:
            comment_text = await comment_future
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

            await random_delay(1, 2)

            # 2. 주제별 보기에서 포스팅 수집
            posts = await collect_blog_posts(page, max_posts)
            if not posts:
                result["error"] = "주제별 보기에서 포스팅을 찾을 수 없습니다"
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

                # 포스팅 간 대기 (8~20초)
                if i < len(posts) - 1:
                    delay = random.uniform(8, 20)
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
