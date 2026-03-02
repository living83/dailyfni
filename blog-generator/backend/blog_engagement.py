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
# 포스트 페이지 vs 블로그 홈 판별
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def is_actual_post_page(page) -> bool:
    """현재 페이지가 실제 블로그 포스트 페이지인지 검증.
    블로그 홈으로 리다이렉트된 경우 False 반환."""

    current_url = page.url or ""

    # URL 기반 빠른 판별: 블로그 홈 패턴이면 즉시 False
    home_patterns = [
        "/BlogHome", "/PostList.naver", "/my-log", "/market",
        "/neighborlog", "/SympathyHistoryList",
    ]
    for pat in home_patterns:
        if pat in current_url:
            logger.info(f"블로그 홈 URL 감지 (스킵): {current_url[:100]}")
            return False

    # URL에 포스트 번호가 있으면 True (blog.naver.com/user/123456)
    import re
    if re.search(r'blog\.naver\.com/[^/\?]+/\d+', current_url):
        return True
    if '/PostView.naver' in current_url and 'logNo=' in current_url:
        return True

    # URL만으로 판별 불가 → DOM 기반 검증
    # 블로그 포스트에만 있는 요소들 확인 (mainFrame 포함)
    targets = [page] + [f for f in page.frames if f.name == 'mainFrame']

    for target in targets:
        try:
            is_post = await target.evaluate('''() => {
                // 포스트 본문 요소가 있는지 확인
                const postSelectors = [
                    '.se-main-container',   // SE ONE 에디터 본문
                    '#postViewArea',        // 구형 에디터 본문
                    '#post-view',           // 또 다른 형태
                    '.post_ct',             // 모바일 형태
                    '.se-component.se-text', // SE 텍스트 블록
                ];
                for (const sel of postSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText && el.innerText.trim().length > 30) {
                        return true;
                    }
                }
                return false;
            }''')
            if is_post:
                return True
        except Exception:
            continue

    # 블로그 홈 특징 감지: 카테고리 목록, 프로필 영역만 있는 경우
    try:
        is_home = await page.evaluate('''() => {
            // 블로그 홈에만 있는 요소들
            const homeIndicators = [
                '.blog_category',           // 카테고리 위젯
                '.category_list',           // 카테고리 목록
                '.area_category',           // 카테고리 영역
                '#category',                // 카테고리 ID
                '.widget_category',         // 카테고리 위젯
            ];
            let homeScore = 0;
            for (const sel of homeIndicators) {
                if (document.querySelector(sel)) homeScore++;
            }
            return homeScore >= 1;
        }''')
        if is_home:
            logger.info(f"블로그 홈 DOM 감지 (스킵): {current_url[:100]}")
            return False
    except Exception:
        pass

    # 판별 불가 → 포스트가 아닌 것으로 간주 (안전 우선)
    logger.warning(f"페이지 유형 판별 불가 (스킵): {current_url[:100]}")
    return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 블로그 피드에서 포스팅 수집
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def collect_blog_posts(page, max_posts: int = 10) -> list:
    """네이버 메인 → 블로그 → 주제별 보기 경로로 포스팅 URL 수집"""
    posts = []

    try:
        # ── 1단계: 네이버 메인에서 "블로그" 링크 클릭 ──
        await page.goto("https://www.naver.com/",
                        wait_until="domcontentloaded", timeout=15000)
        await random_delay(1, 2)

        # 상단 네비게이션의 "블로그" 링크 URL 추출 후 goto
        # (클릭하면 target="_blank"로 새 탭이 열릴 수 있어서 URL을 직접 가져옴)
        blog_url = await page.evaluate('''() => {
            const links = document.querySelectorAll('a');
            for (const a of links) {
                const text = (a.textContent || '').trim();
                const href = a.href || '';
                if (text === '블로그' && href.includes('blog')) return href;
            }
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

        # ── 2단계: "주제별 보기" 탭 클릭 (SPA 내부 네비게이션) ──
        # section.blog.naver.com은 React SPA라서 page.goto()로 이동하면
        # 빈 SPA 쉘만 로드됨. 반드시 SPA 내부에서 클릭해야 올바르게 라우팅됨.

        # SPA 완전 로딩 대기
        await page.wait_for_load_state("load", timeout=10000)
        await random_delay(1, 2)

        clicked_topic = False

        # 방법 1: Playwright 텍스트 셀렉터로 클릭
        for selector in [
            'a:has-text("주제별 보기")',
            'text=주제별 보기',
            'a:has-text("주제별보기")',
        ]:
            try:
                await page.click(selector, timeout=3000)
                clicked_topic = True
                logger.info(f"주제별 보기 탭 클릭 성공: {selector}")
                break
            except Exception:
                continue

        # 방법 2: JS 클릭 폴백
        if not clicked_topic:
            clicked = await page.evaluate('''() => {
                const links = document.querySelectorAll('a, button, [role="tab"]');
                for (const el of links) {
                    const text = (el.textContent || '').trim();
                    if (text === '주제별 보기' || text === '주제별보기' ||
                        (text.includes('주제별') && text.includes('보기'))) {
                        el.click();
                        return true;
                    }
                }
                return false;
            }''')
            if clicked:
                clicked_topic = True
                logger.info("주제별 보기 탭 클릭 성공 (JS)")

        if clicked_topic:
            # SPA 라우팅 완료 대기
            await random_delay(2, 3)
        else:
            # 최종 폴백: ThemePost.naver 직접 이동 (SPA 재로드)
            logger.warning("주제별 보기 클릭 실패 → ThemePost.naver 직접 이동")
            await page.goto(
                "https://section.blog.naver.com/ThemePost.naver",
                wait_until="load", timeout=15000,
            )
            await random_delay(3, 5)

        logger.info(f"주제별 보기 도착: {page.url}")

        # SPA 콘텐츠 렌더링 대기
        await page.wait_for_load_state("load", timeout=10000)
        await random_delay(2, 3)

        # ── 3단계: 포스팅 목록 수집 ──
        # 먼저 페이지 구조 파악 (디버그)
        page_debug = await page.evaluate('''() => {
            const allLinks = document.querySelectorAll('a');
            const sample = [];
            for (let i = 0; i < Math.min(allLinks.length, 50); i++) {
                const a = allLinks[i];
                const href = (a.href || '').substring(0, 120);
                const text = (a.textContent || '').trim().substring(0, 60);
                const cls = (a.className || '').substring(0, 60);
                if (text.length > 3) {
                    sample.push(text + ' → ' + href + ' [' + cls + ']');
                }
            }
            return {
                url: location.href,
                totalLinks: allLinks.length,
                totalElements: document.querySelectorAll('*').length,
                sample: sample,
            };
        }''')
        logger.info(f"ThemePost 링크 수: {page_debug.get('totalLinks', 0)}, "
                     f"요소 수: {page_debug.get('totalElements', 0)}")
        for s in page_debug.get('sample', [])[:15]:
            logger.info(f"  링크: {s}")

        # 스크롤 다운으로 더 많은 포스팅 로드
        for _ in range(5):
            await page.evaluate('window.scrollBy(0, 600)')
            await random_delay(0.3, 0.6)

        posts = await page.evaluate(f'''() => {{
            const results = [];
            const seen = new Set();

            // 포스팅 URL 검증 (엄격 모드)
            function isPostUrl(url) {{
                if (!url) return false;
                if (!url.includes('blog.naver.com')) return false;

                // 블로그 홈/목록 패턴 제외
                const excludePatterns = [
                    'seller.blog.naver.com',
                    '/BlogHome', '/PostList.naver', '/my-log', '/market',
                    '/neighborlog', '/SympathyHistoryList',
                    '/ProfileView', '/profile',
                ];
                for (const pat of excludePatterns) {{
                    if (url.includes(pat)) return false;
                }}

                // 포스트 상세 URL만 허용
                // 1) blog.naver.com/사용자/포스트번호 (가장 일반적)
                if (/blog\\.naver\\.com\\/[^\\/\\?]+\\/[0-9]{{6,}}/.test(url)) return true;
                // 2) PostView.naver?logNo=...
                if (url.includes('/PostView.naver') && url.includes('logNo=')) return true;
                // 3) section.blog.naver.com/...detail...logNo
                if (url.includes('section.blog.naver.com') &&
                    url.includes('/detail') && url.includes('logNo=')) return true;

                return false;
            }}

            // 블로그 홈/프로필 URL인지 확인 (추가 필터)
            function isBlogHomeUrl(url) {{
                if (!url) return false;
                // blog.naver.com/username (포스트 번호 없음) = 블로그 홈
                const m = url.match(/blog\\.naver\\.com\\/([^\\/\\?#]+)\\/?$/);
                if (m && !/^[0-9]+$/.test(m[1])) return true;
                // section.blog.naver.com/BlogHome
                if (url.includes('/BlogHome')) return true;
                return false;
            }}

            // 메인 콘텐츠 영역에서 포스트 카드 찾기
            // (사이드바 "내 소식" 제외)
            const mainSelectors = [
                // section.blog.naver.com 주제별 보기 메인 콘텐츠
                '.list_post_article a',
                '.area_list_search a',
                '.item_post a',
                '.content_area a',
                '.area_cont a',
                '.list_content a',
                // 포스트 카드 타이틀 링크
                'a.desc_txt',
                'a[class*="title"]',
                'a[class*="link_post"]',
                'a[class*="post_txt"]',
                // 공통
                '[class*="post_area"] a',
                '[class*="theme_post"] a',
                '[class*="article_area"] a',
            ];

            for (const sel of mainSelectors) {{
                const links = document.querySelectorAll(sel);
                for (const link of links) {{
                    const href = link.href || link.getAttribute('href') || '';
                    const title = (link.textContent || '').trim().substring(0, 100);

                    // 사이드바 요소 제외
                    const inSidebar = link.closest(
                        '.aside, [class*="aside"], [class*="sidebar"], ' +
                        '[class*="my_news"], [class*="area_my"], [class*="snb"]'
                    );
                    if (inSidebar) continue;

                    // 블로그 홈 URL 명시적 제외
                    if (isBlogHomeUrl(href)) continue;

                    if (isPostUrl(href) && title && title.length > 5 &&
                        !seen.has(href)) {{
                        seen.add(href);
                        results.push({{ url: href, title: title }});
                    }}
                    if (results.length >= {max_posts}) break;
                }}
                if (results.length >= {max_posts}) break;
            }}

            // 폴백: 사이드바 제외하고 모든 링크에서 포스트 URL 수집
            if (results.length === 0) {{
                const allLinks = document.querySelectorAll('a');
                for (const link of allLinks) {{
                    const href = link.href || '';
                    const title = (link.textContent || '').trim().substring(0, 100);

                    // 사이드바 제외
                    const inSidebar = link.closest(
                        '.aside, [class*="aside"], [class*="sidebar"], ' +
                        '[class*="my_news"], [class*="area_my"], [class*="snb"]'
                    );
                    if (inSidebar) continue;

                    // 블로그 홈 URL 명시적 제외
                    if (isBlogHomeUrl(href)) continue;

                    if (isPostUrl(href) && title && title.length > 5 &&
                        !seen.has(href)) {{
                        seen.add(href);
                        results.push({{ url: href, title: title }});
                    }}
                    if (results.length >= {max_posts}) break;
                }}
            }}

            return results;
        }}''')

        logger.info(f"주제별 보기에서 포스팅 {len(posts)}개 수집 (필터 전)")
        for p in posts[:5]:
            logger.info(f"  수집: {p.get('title', '?')[:40]} → {p.get('url', '?')[:80]}")

        # Python 단 URL 재검증 (JS 필터 통과한 URL 이중 확인)
        import re
        validated_posts = []
        for p in posts:
            url = p.get("url", "")
            # 반드시 포스트 번호가 포함된 URL만 허용
            has_post_num = bool(re.search(r'blog\.naver\.com/[^/\?]+/\d{6,}', url))
            has_logno = ('PostView.naver' in url and 'logNo=' in url)
            has_detail_logno = ('section.blog.naver.com' in url and '/detail' in url and 'logNo=' in url)

            if has_post_num or has_logno or has_detail_logno:
                validated_posts.append(p)
            else:
                logger.warning(f"  URL 필터링 (포스트번호 없음): {url[:100]}")

        if len(validated_posts) < len(posts):
            logger.info(f"URL 검증 후: {len(posts)} → {len(validated_posts)}개")
        posts = validated_posts

        # 포스팅 없으면 디버그 정보
        if not posts:
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

        # 리다이렉트 감지: URL 변경 확인
        final_url = page.url or ""
        if final_url != post_url:
            logger.info(f"URL 변경 감지: {post_url[:80]} → {final_url[:80]}")

        # 포스트 페이지 검증: 블로그 홈이면 스킵
        if not await is_actual_post_page(page):
            result["error"] = "블로그 홈으로 리다이렉트됨 (포스트 아님)"
            logger.warning(f"포스트 아님 (스킵): 요청={post_url[:80]} 도착={final_url[:80]}")
            return result

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

async def _scroll_to_sympathy_area(frame):
    """mainFrame 내부에서 공감(area_sympathy) 영역까지 스크롤 + AJAX 로드 대기."""
    try:
        # 1단계: area_sympathy가 이미 있는지 확인
        has_area = await frame.evaluate('''() => {
            return !!document.querySelector('.area_sympathy, #sympathyArea, .u_likeit_list_module');
        }''')
        if has_area:
            # block:"start" → 뷰포트 상단에 배치 (하단 플로팅 바와 겹치지 않도록)
            await frame.evaluate('''() => {
                const area = document.querySelector('.area_sympathy, #sympathyArea, .u_likeit_list_module');
                if (area) area.scrollIntoView({ block: "start", behavior: "instant" });
            }''')
            # AJAX JS 핸들러 바인딩 대기 (0.5초 → 1.5초)
            await asyncio.sleep(1.5)
            return True

        # 2단계: 없으면 본문 하단까지 점진적 스크롤 (AJAX 트리거)
        logger.info("mainFrame 공감 영역 스크롤 탐색 시작")
        for i in range(10):
            await frame.evaluate('window.scrollBy(0, 800)')
            await asyncio.sleep(0.4)
            found = await frame.evaluate('''() => {
                const area = document.querySelector('.area_sympathy, #sympathyArea, .u_likeit_list_module');
                if (area) {
                    area.scrollIntoView({ block: "start", behavior: "instant" });
                    return true;
                }
                return false;
            }''')
            if found:
                logger.info(f"공감 영역 발견 (스크롤 {i+1}회)")
                # JS 핸들러 바인딩 대기
                await asyncio.sleep(1.5)
                return True

        logger.info("mainFrame 스크롤 완료, 공감 영역 미발견")
        return False
    except Exception as e:
        logger.warning(f"공감 영역 스크롤 오류: {e}")
        return False


async def _find_like_button(page):
    """모든 프레임에서 공감 버튼을 찾아 (frame, selector, info) 반환.

    핵심: 실제 클릭 가능한 공감 버튼은 mainFrame 내부 div.area_sympathy 안에 있음.
    외부 페이지의 플로팅 바는 시각적 미러일 뿐 API를 트리거하지 않음.
    """
    # mainFrame 전용 셀렉터 (area_sympathy 내부 우선)
    MAIN_FRAME_SELECTORS = [
        '.area_sympathy .u_likeit_list_module .u_likeit_btn',
        '.area_sympathy .u_likeit_btn',
        '#sympathyArea .u_likeit_btn',
        '.area_sympathy a[role="button"]',
        '#sympathyArea a[role="button"]',
        '.u_likeit_list_module .u_likeit_btn',
        '.u_likeit_btn',
    ]

    # 외부 페이지 폴백 셀렉터
    OUTER_SELECTORS = [
        '.u_likeit_list_module .u_likeit_btn',
        '.u_likeit_btn',
        '.btn_like',
        'button.like_btn',
        'a.like_btn',
    ]

    # ── 1. mainFrame 우선 탐색 (실제 공감 버튼 위치) ──
    main_frame = None
    for f in page.frames:
        if f.name == 'mainFrame':
            main_frame = f
            break

    if main_frame:
        # mainFrame 내 공감 영역까지 스크롤 + AJAX 대기
        await _scroll_to_sympathy_area(main_frame)

        for sel in MAIN_FRAME_SELECTORS:
            try:
                info = await main_frame.evaluate('''(sel) => {
                    const btn = document.querySelector(sel);
                    if (!btn) return null;
                    if (btn.closest('[class*="power_link"], [class*="ad_"], .revenue_unit')) return null;
                    const rect = btn.getBoundingClientRect();
                    return {
                        tag: btn.tagName,
                        cls: btn.className.substring(0, 80),
                        text: (btn.textContent || '').trim().substring(0, 50),
                        isOn: btn.classList.contains('on'),
                        w: rect.width, h: rect.height,
                        x: rect.left + rect.width / 2,
                        y: rect.top  + rect.height / 2,
                        visible: rect.width > 0 && rect.height > 0,
                    };
                }''', sel)
                if info and info.get('visible'):
                    logger.info(f"mainFrame 공감 버튼 발견: sel={sel}, cls={info['cls'][:40]}")
                    return main_frame, sel, info
            except Exception:
                continue

        # mainFrame에서 "공감" 텍스트 폴백
        try:
            fallback = await main_frame.evaluate('''() => {
                const area = document.querySelector('.area_sympathy, #sympathyArea');
                const scope = area || document;
                for (const el of scope.querySelectorAll('a, button, [role="button"]')) {
                    const text = (el.textContent || '').trim();
                    if (text.startsWith('공감') && text.length < 20) {
                        if (el.closest('[class*="power_link"], [class*="ad_"]')) continue;
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            return {
                                tag: el.tagName,
                                cls: (typeof el.className === 'string' ? el.className : '').substring(0, 80),
                                text: text.substring(0, 50),
                                isOn: el.classList.contains('on'),
                                w: rect.width, h: rect.height,
                                x: rect.left + rect.width / 2,
                                y: rect.top + rect.height / 2,
                                visible: true,
                            };
                        }
                    }
                }
                return null;
            }''')
            if fallback:
                logger.info(f"mainFrame 공감 텍스트 폴백: {fallback}")
                return main_frame, '__text_fallback__', fallback
        except Exception:
            pass

    # ── 2. 외부 페이지 플로팅 바에서 ♡ 버튼 탐지 ──
    # 플로팅 바는 position:fixed 로 하단에 고정된 영역
    try:
        floating_btn = await page.evaluate('''() => {
            // position:fixed이고 뷰포트 하단에 있는 요소 찾기
            const vh = window.innerHeight;
            const fixedContainers = [];
            for (const el of document.querySelectorAll('*')) {
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed') {
                    const rect = el.getBoundingClientRect();
                    // 하단 100px 내에 위치한 고정 요소
                    if (rect.bottom >= vh - 100 && rect.height > 20 && rect.height < 120) {
                        fixedContainers.push(el);
                    }
                }
            }
            // 고정 컨테이너 내에서 공감/like 관련 클릭 가능 요소 찾기
            for (const container of fixedContainers) {
                const candidates = container.querySelectorAll('a, button, [role="button"], span[class*="like"], span[class*="sympathy"]');
                for (const btn of candidates) {
                    const cls = typeof btn.className === 'string' ? btn.className : '';
                    const text = (btn.textContent || '').trim();
                    // 공감/like 관련 요소 식별
                    if (cls.includes('like') || cls.includes('sympathy') ||
                        cls.includes('u_likeit') ||
                        (text.length <= 10 && (text.includes('공감') || text === '')) ||
                        btn.querySelector('[class*="like"], [class*="heart"], [class*="ico_like"]')) {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 10 && rect.height > 10) {
                            return {
                                tag: btn.tagName,
                                cls: cls.substring(0, 100),
                                text: text.substring(0, 50),
                                x: rect.left + rect.width / 2,
                                y: rect.top + rect.height / 2,
                                w: rect.width, h: rect.height,
                                isOn: btn.classList.contains('on'),
                                visible: true,
                                source: 'floating_bar',
                            };
                        }
                    }
                }
                // 폴백: 컨테이너의 첫번째 클릭 가능 요소 (♡는 보통 맨 왼쪽)
                const firstBtn = container.querySelector('a, button, [role="button"]');
                if (firstBtn) {
                    const rect = firstBtn.getBoundingClientRect();
                    const cls = typeof firstBtn.className === 'string' ? firstBtn.className : '';
                    if (rect.width > 10 && rect.height > 10 && rect.left < 150) {
                        return {
                            tag: firstBtn.tagName,
                            cls: cls.substring(0, 100),
                            text: (firstBtn.textContent || '').trim().substring(0, 50),
                            x: rect.left + rect.width / 2,
                            y: rect.top + rect.height / 2,
                            w: rect.width, h: rect.height,
                            isOn: firstBtn.classList.contains('on'),
                            visible: true,
                            source: 'floating_bar_first',
                        };
                    }
                }
            }
            return null;
        }''')
        if floating_btn:
            logger.info(f"플로팅 바 공감 버튼 발견: {floating_btn}")
            return page.main_frame, '__floating_bar__', floating_btn
    except Exception as e:
        logger.info(f"플로팅 바 탐지 오류: {e}")

    # ── 3. 기타 프레임 폴백 (일반 셀렉터) ──
    other_frames = [page.main_frame]
    for f in page.frames:
        if f != page.main_frame and f.name != 'mainFrame':
            other_frames.append(f)

    for frame in other_frames:
        for sel in OUTER_SELECTORS:
            try:
                info = await frame.evaluate('''(sel) => {
                    const btn = document.querySelector(sel);
                    if (!btn) return null;
                    if (btn.closest('[class*="power_link"], [class*="ad_"], .revenue_unit')) return null;
                    const rect = btn.getBoundingClientRect();
                    return {
                        tag: btn.tagName,
                        cls: btn.className.substring(0, 80),
                        text: (btn.textContent || '').trim().substring(0, 50),
                        isOn: btn.classList.contains('on'),
                        w: rect.width, h: rect.height,
                        x: rect.left + rect.width / 2,
                        y: rect.top  + rect.height / 2,
                        visible: rect.width > 0 && rect.height > 0,
                    };
                }''', sel)
                if info and info.get('visible'):
                    logger.info(f"외부 프레임 공감 버튼 발견: frame={frame.name or 'outer'}, sel={sel}")
                    return frame, sel, info
            except Exception:
                continue

    return None, None, None


async def _hide_floating_bar(page):
    """외부 페이지의 하단 플로팅 바를 임시로 숨김 (mainFrame 클릭 방해 방지)."""
    try:
        hidden = await page.evaluate('''() => {
            let count = 0;
            const vh = window.innerHeight;
            for (const el of document.querySelectorAll('*')) {
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed') {
                    const rect = el.getBoundingClientRect();
                    if (rect.bottom >= vh - 100 && rect.height > 20 && rect.height < 120) {
                        el.setAttribute('data-hidden-by-bot', el.style.display || '');
                        el.style.setProperty('display', 'none', 'important');
                        count++;
                    }
                }
            }
            return count;
        }''')
        if hidden:
            logger.info(f"플로팅 바 {hidden}개 숨김")
        return hidden
    except Exception:
        return 0


async def _restore_floating_bar(page):
    """숨긴 플로팅 바 복원."""
    try:
        await page.evaluate('''() => {
            for (const el of document.querySelectorAll('[data-hidden-by-bot]')) {
                const orig = el.getAttribute('data-hidden-by-bot');
                el.style.display = orig;
                el.removeAttribute('data-hidden-by-bot');
            }
        }''')
    except Exception:
        pass


async def click_like(page) -> dict:
    """현재 페이지의 공감(하트) 버튼 클릭.

    전략:
    A. mainFrame의 area_sympathy 버튼 → 플로팅 바 숨기고 locator.click(force=True)
    B. 외부 플로팅 바의 ♡ 버튼 → 좌표 기반 직접 클릭
    C. 모든 프레임에서 JS dispatchEvent 폴백
    """
    result = {"success": False, "already_liked": False, "error": ""}

    try:
        # ── 1. 공감 버튼 찾기 (mainFrame 우선, 스크롤 + AJAX 대기 포함) ──
        frame, selector, info = await _find_like_button(page)

        if not frame:
            # 디버그: 모든 프레임 공감 관련 요소
            for f in page.frames:
                try:
                    dbg = await f.evaluate('''() => {
                        const items = [];
                        for (const el of document.querySelectorAll('*')) {
                            const cls = typeof el.className === 'string' ? el.className : '';
                            if (cls.includes('likeit') || cls.includes('sympathy') || cls.includes('like_it')) {
                                const r = el.getBoundingClientRect();
                                items.push(el.tagName + '.' + cls.substring(0,60) +
                                    ' vis=' + (r.width > 0 && r.height > 0) +
                                    ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0) +
                                    ' @' + r.left.toFixed(0) + ',' + r.top.toFixed(0));
                            }
                        }
                        return items.slice(0, 20);
                    }''')
                    if dbg:
                        logger.info(f"[디버그] '{f.name or 'outer'}' 공감요소: {dbg}")
                except Exception:
                    continue
            await capture_debug(page, "like_not_found")
            result["error"] = "공감 버튼 미발견"
            return result

        logger.info(
            f"공감 버튼: frame={frame.name or 'outer'}, sel={selector}, "
            f"cls={info['cls'][:40]}, isOn={info['isOn']}, "
            f"size={info['w']:.0f}x{info['h']:.0f}, "
            f"pos=({info.get('x',0):.0f},{info.get('y',0):.0f})"
        )

        if info['isOn']:
            result["already_liked"] = True
            result["success"] = True
            logger.info("이미 공감한 글입니다")
            return result

        # 디버그 스크린샷: 클릭 전
        await capture_debug(page, "like_before_click")

        # 디버그: 클릭 대상 HTML 덤프
        if selector not in ('__text_fallback__', '__floating_bar__'):
            try:
                html_dump = await frame.evaluate('''(sel) => {
                    const btn = document.querySelector(sel);
                    if (!btn) return null;
                    return {
                        outerHTML: btn.outerHTML.substring(0, 300),
                        parentTag: btn.parentElement ? btn.parentElement.tagName : '?',
                        parentCls: btn.parentElement ? (btn.parentElement.className || '').substring(0, 80) : '?',
                        areaHTML: (() => {
                            const a = document.querySelector('.area_sympathy');
                            return a ? a.outerHTML.substring(0, 500) : 'area_sympathy NOT FOUND';
                        })(),
                    };
                }''', selector)
                if html_dump:
                    logger.info(f"[HTML덤프] btn: {html_dump.get('outerHTML','')[:200]}")
                    logger.info(f"[HTML덤프] parent: {html_dump.get('parentTag','')} .{html_dump.get('parentCls','')[:60]}")
                    logger.info(f"[HTML덤프] area: {html_dump.get('areaHTML','')[:300]}")
            except Exception:
                pass

        # ── 2. 클릭 실행 ──
        clicked = False
        is_in_mainframe = (frame.name == 'mainFrame')
        is_floating = (selector == '__floating_bar__')

        # ──── 전략 A: mainFrame 버튼 (플로팅 바 숨기고 클릭) ────
        if is_in_mainframe and not is_floating:
            # 플로팅 바를 숨겨서 클릭 차단 방지
            await _hide_floating_bar(page)

            # A-1: locator.click(force=True) - 가장 신뢰할 수 있는 방법
            if selector not in ('__text_fallback__', '__floating_bar__'):
                try:
                    locator = frame.locator(selector).first
                    # block:"start"로 스크롤 (플로팅 바 영역 회피)
                    await frame.evaluate('''(sel) => {
                        const btn = document.querySelector(sel);
                        if (btn) btn.scrollIntoView({ block: "start", behavior: "instant" });
                    }''', selector)
                    await random_delay(0.3, 0.5)
                    await locator.click(force=True, timeout=5000)
                    clicked = True
                    logger.info(f"전략A-1: mainFrame locator.click(force) 성공: {selector}")
                except Exception as e1:
                    logger.info(f"전략A-1 실패: {e1}")

            # A-2: 좌표 기반 mouse.click (iframe 오프셋 보정)
            if not clicked:
                try:
                    if selector in ('__text_fallback__',):
                        coords = {'x': info['x'], 'y': info['y']}
                    else:
                        coords = await frame.evaluate('''(sel) => {
                            const btn = document.querySelector(sel);
                            if (!btn) return null;
                            btn.scrollIntoView({ block: "start", behavior: "instant" });
                            const r = btn.getBoundingClientRect();
                            return { x: r.left + r.width/2, y: r.top + r.height/2 };
                        }''', selector)

                    if coords:
                        click_x, click_y = coords['x'], coords['y']
                        try:
                            offset = await page.evaluate('''() => {
                                const iframe = document.querySelector('iframe[name="mainFrame"]');
                                if (!iframe) return { x: 0, y: 0 };
                                const r = iframe.getBoundingClientRect();
                                return { x: r.left, y: r.top };
                            }''')
                            click_x += offset.get('x', 0)
                            click_y += offset.get('y', 0)
                        except Exception:
                            pass

                        await random_delay(0.2, 0.4)
                        await page.mouse.click(click_x, click_y)
                        clicked = True
                        logger.info(f"전략A-2: 좌표 클릭 성공: ({click_x:.0f}, {click_y:.0f})")
                except Exception as e2:
                    logger.info(f"전략A-2 실패: {e2}")

            # A-3: JS element.click() (isTrusted: true → 네이버 핸들러 호환)
            if not clicked:
                try:
                    ok = await frame.evaluate('''(sel) => {
                        let btn;
                        if (sel === '__text_fallback__') {
                            const area = document.querySelector('.area_sympathy, #sympathyArea') || document;
                            for (const el of area.querySelectorAll('a, button, [role="button"]')) {
                                if ((el.textContent || '').trim().startsWith('공감')) { btn = el; break; }
                            }
                        } else {
                            btn = document.querySelector(sel);
                        }
                        if (!btn) return false;
                        // element.click()은 isTrusted: true (dispatchEvent와 다름)
                        btn.click();
                        return true;
                    }''', selector)
                    if ok:
                        clicked = True
                        logger.info("전략A-3: JS element.click() 성공")
                except Exception as e3:
                    logger.info(f"전략A-3 실패: {e3}")

            # 플로팅 바 복원
            await _restore_floating_bar(page)

        # ──── 전략 B: 플로팅 바 ♡ 직접 클릭 ────
        if not clicked and (is_floating or not is_in_mainframe):
            click_x = info.get('x', 0)
            click_y = info.get('y', 0)

            if click_x > 0 and click_y > 0:
                try:
                    await random_delay(0.2, 0.4)
                    await page.mouse.click(click_x, click_y)
                    clicked = True
                    logger.info(f"전략B: 플로팅 바 좌표 클릭 성공: ({click_x:.0f}, {click_y:.0f})")
                except Exception as e4:
                    logger.info(f"전략B 좌표 클릭 실패: {e4}")

            # B-2: locator 폴백
            if not clicked and selector not in ('__text_fallback__', '__floating_bar__'):
                try:
                    locator = frame.locator(selector).first
                    await locator.click(force=True, timeout=5000)
                    clicked = True
                    logger.info(f"전략B-2: locator.click(force) 성공: {selector}")
                except Exception as e5:
                    logger.info(f"전략B-2 실패: {e5}")

        # ──── 전략 C: mainFrame 실패 후 플로팅 바 시도 ────
        if not clicked and is_in_mainframe:
            logger.info("mainFrame 클릭 실패 → 플로팅 바 ♡ 시도")
            try:
                floating_info = await page.evaluate('''() => {
                    const vh = window.innerHeight;
                    for (const el of document.querySelectorAll('*')) {
                        const style = window.getComputedStyle(el);
                        if (style.position === 'fixed') {
                            const rect = el.getBoundingClientRect();
                            if (rect.bottom >= vh - 100 && rect.height > 20 && rect.height < 120) {
                                // 컨테이너의 첫번째 클릭 가능 요소 (♡)
                                const btn = el.querySelector('a, button, [role="button"]');
                                if (btn) {
                                    const br = btn.getBoundingClientRect();
                                    return { x: br.left + br.width/2, y: br.top + br.height/2 };
                                }
                            }
                        }
                    }
                    return null;
                }''')
                if floating_info:
                    await page.mouse.click(floating_info['x'], floating_info['y'])
                    clicked = True
                    logger.info(f"전략C: 플로팅 바 폴백 클릭 성공: ({floating_info['x']:.0f}, {floating_info['y']:.0f})")
            except Exception as e6:
                logger.info(f"전략C 실패: {e6}")

        if not clicked:
            await capture_debug(page, "like_click_failed")
            result["error"] = "모든 클릭 방법 실패"
            return result

        await random_delay(0.8, 1.5)

        # ── 2-1. 리액션 피커 처리 ──
        # 네이버 블로그는 ♡ 클릭 시 리액션 피커(좋아요/훈훈해요/슬퍼요 등)가
        # 나타날 수 있음. 피커가 보이면 첫 번째 리액션(좋아요) 클릭.
        reaction_handled = False
        for check_frame in [frame] + ([page.main_frame] if frame != page.main_frame else []):
            try:
                reaction_info = await check_frame.evaluate('''() => {
                    // 리액션 레이어 찾기 (u_likeit_layer, reaction_layer 등)
                    const layerSels = [
                        '.u_likeit_layer',
                        '[class*="likeit_layer"]',
                        '[class*="reaction_layer"]',
                        '[class*="sympathy_layer"]',
                        '.u_likeit_module .u_likeit_layer',
                    ];
                    for (const sel of layerSels) {
                        const layers = document.querySelectorAll(sel);
                        for (const layer of layers) {
                            const style = window.getComputedStyle(layer);
                            if (style.display === 'none' || style.visibility === 'hidden' ||
                                style.opacity === '0') continue;
                            const rect = layer.getBoundingClientRect();
                            if (rect.width < 10 || rect.height < 10) continue;

                            // 레이어 내 첫 번째 리액션 버튼 찾기
                            const btns = layer.querySelectorAll(
                                'a, button, [role="button"], li, .u_likeit_list_btn'
                            );
                            for (const btn of btns) {
                                const br = btn.getBoundingClientRect();
                                if (br.width > 5 && br.height > 5) {
                                    return {
                                        layerSel: sel,
                                        layerSize: rect.width.toFixed(0) + 'x' + rect.height.toFixed(0),
                                        btnTag: btn.tagName,
                                        btnCls: (typeof btn.className === 'string' ? btn.className : '').substring(0, 80),
                                        btnText: (btn.textContent || '').trim().substring(0, 30),
                                        x: br.left + br.width / 2,
                                        y: br.top + br.height / 2,
                                        inFrame: true,
                                    };
                                }
                            }
                        }
                    }
                    return null;
                }''')
                if reaction_info:
                    logger.info(f"리액션 피커 발견! {reaction_info}")
                    rx, ry = reaction_info['x'], reaction_info['y']
                    # iframe 오프셋 보정
                    if check_frame.name == 'mainFrame':
                        try:
                            offset = await page.evaluate('''() => {
                                const iframe = document.querySelector('iframe[name="mainFrame"]');
                                if (!iframe) return { x: 0, y: 0 };
                                const r = iframe.getBoundingClientRect();
                                return { x: r.left, y: r.top };
                            }''')
                            rx += offset.get('x', 0)
                            ry += offset.get('y', 0)
                        except Exception:
                            pass
                    await random_delay(0.3, 0.5)
                    await page.mouse.click(rx, ry)
                    reaction_handled = True
                    logger.info(f"리액션 클릭 완료: ({rx:.0f}, {ry:.0f}) {reaction_info.get('btnText','')}")
                    await random_delay(0.5, 1.0)
                    break
            except Exception:
                continue

        if reaction_handled:
            logger.info("리액션 피커 처리 완료")

        # 디버그 스크린샷: 클릭 후
        await capture_debug(page, "like_after_click")

        # ── 3. 클릭 후 검증 ──
        current_url = page.url or ""
        if 'naver.com' not in current_url:
            logger.warning(f"공감 클릭 후 페이지 이탈: {current_url[:80]}")
            result["error"] = f"페이지 이탈: {current_url[:60]}"
            return result

        # .on 클래스 확인 (mainFrame에서 체크)
        try:
            check_frame = frame
            # 플로팅 바로 클릭한 경우 mainFrame에서도 확인
            main_frame = None
            for f in page.frames:
                if f.name == 'mainFrame':
                    main_frame = f
                    break
            if main_frame:
                check_frame = main_frame

            after = await check_frame.evaluate('''() => {
                const btn = document.querySelector(
                    '.area_sympathy .u_likeit_btn, .u_likeit_btn, ' +
                    '#sympathyArea a[role="button"], .area_sympathy a[role="button"]'
                );
                if (!btn) return { found: false };
                return {
                    found: true,
                    isOn: btn.classList.contains('on'),
                    cls: btn.className.substring(0, 80),
                };
            }''')

            if after.get('isOn'):
                result["success"] = True
                logger.info("공감 성공! (on 클래스 확인)")
            else:
                result["success"] = True
                logger.info(f"공감 클릭 수행 (on 미확인, cls={after.get('cls','')})")
        except Exception:
            result["success"] = True
            logger.info("공감 클릭 수행 (확인 불가)")

    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"공감 클릭 예외: {e}")

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
        # ── 1. mainFrame 내부를 스크롤 (댓글 영역 로딩 트리거) ──
        # 네이버 블로그는 포스트가 mainFrame iframe 안에 있고,
        # 댓글 영역도 mainFrame 하단에 위치. 외부 page 스크롤로는 로딩 안 됨.
        main_frame = None
        for frame in page.frames:
            if frame.name == 'mainFrame':
                main_frame = frame
                break

        if main_frame:
            # mainFrame 내부 스크롤 (댓글 영역은 본문 바로 아래)
            logger.info("mainFrame 내부 스크롤 시작 (댓글 영역 로딩)")
            for _ in range(6):
                await main_frame.evaluate('window.scrollBy(0, 600)')
                await random_delay(0.3, 0.5)
            # 댓글 영역 로딩 대기
            await random_delay(1, 2)
        else:
            logger.warning("mainFrame 미발견, 메인 페이지 스크롤")
            for _ in range(5):
                await page.evaluate('window.scrollBy(0, 600)')
                await random_delay(0.3, 0.5)
            await random_delay(1, 2)

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
        # 1. 포스팅 내용 읽기 (리다이렉트 감지 포함)
        post_data = await read_post_content(page, post_url)
        result["post_title"] = post_data.get("title", "")

        if post_data.get("error"):
            error_msg = post_data['error']
            logger.warning(f"본문 추출 실패: {error_msg} (URL: {post_url})")
            # 블로그 홈으로 리다이렉트된 경우 → 공감/댓글 시도 없이 즉시 스킵
            if "블로그 홈" in error_msg or "포스트 아님" in error_msg:
                result["error"] = error_msg
                return result

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

            # 공감 클릭 후 페이지 이탈 감지 (광고 클릭 등으로 이동된 경우)
            current_url = page.url or ""
            if (post_url not in current_url and
                'blog.naver.com' not in current_url):
                logger.warning(
                    f"페이지 이탈 감지! 원래={post_url[:60]} "
                    f"현재={current_url[:60]} → 복귀 시도"
                )
                await page.goto(post_url, wait_until="domcontentloaded",
                                timeout=15000)
                await random_delay(1, 2)

        # 3. 댓글 생성 완료 대기 + 작성
        if comment_future:
            comment_text = await comment_future
            result["comment_text"] = comment_text

            if comment_text:
                # 댓글 작성 전 포스트 페이지 확인
                current_url = page.url or ""
                if ('blog.naver.com' not in current_url):
                    logger.warning(f"댓글 작성 전 페이지 이탈 감지 → 복귀: {post_url[:60]}")
                    await page.goto(post_url, wait_until="domcontentloaded",
                                    timeout=15000)
                    await random_delay(1, 2)

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
