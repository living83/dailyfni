# 네이버 블로그 좋아요/댓글 자동화 로직 설명서 (안티그래비티 이식용)

---

## 1. 전체 아키텍처 요약

```
[스케줄러] → [계정별 참여 실행] → [로그인] → [포스팅 수집] → [포스팅 순회]
                                                                ├─ 공감(좋아요) 클릭
                                                                ├─ AI 댓글 생성 (병렬)
                                                                └─ 댓글 작성
```

### 파일 구성

| 파일 | 역할 |
|------|------|
| `blog_engagement.py` | 핵심 로직 전부 (포스팅 수집, 좋아요, 댓글 생성/작성) |
| `scheduler.py` | 하루 1회 cron 잡으로 자동 실행 |
| `database.py` | `engagement_history` 테이블 CRUD |
| `se_helpers.py` | `login()`, `create_stealth_context()`, `random_delay()` 등 공용 유틸리티 |

---

## 2. DB 테이블 (`engagement_history`)

```sql
CREATE TABLE IF NOT EXISTS engagement_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    post_url VARCHAR(500) NOT NULL,
    post_title VARCHAR(300) DEFAULT '',
    like_success TINYINT DEFAULT 0,       -- 공감 성공 여부
    comment_success TINYINT DEFAULT 0,    -- 댓글 성공 여부
    comment_text TEXT,                     -- 작성한 댓글 내용
    error_message TEXT,                    -- 에러 메시지
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### DB CRUD 함수 (database.py)

- `create_engagement(data)` — 참여 이력 1건 INSERT
- `get_engagement_history(limit=100)` — 최근 이력 조회 (accounts JOIN)
- `get_engagement_stats()` — 오늘/전체 통계 (총 공감수, 총 댓글수, 오늘 공감수, 오늘 댓글수)

---

## 3. 스케줄러 (scheduler.py)

### `daily_engagement_job()` — 하루 1회 실행되는 메인 잡

**흐름:**

1. `scheduler_config`에서 설정 로드
   - `engagement_enabled` — 활성화 여부
   - `engagement_max_posts` — 포스팅 최대 개수 (기본 10)
   - `engagement_do_like` — 공감 실행 여부
   - `engagement_do_comment` — 댓글 실행 여부
   - `engagement_hour`, `engagement_minute` — 실행 시간
   - `engagement_account_ids` — 선택된 계정 ID 목록
2. 활성 계정 필터링 (선택된 계정 ID가 있으면 해당 계정만)
3. 각 계정에 대해 `run_engagement()` 호출
4. 결과를 `engagement_history` DB에 저장
5. **계정 간 30~60초 랜덤 대기**
6. 완료 후 알림 생성 ("공감 N개, 댓글 N개 완료")

### 스케줄러 등록

```python
# APScheduler cron 방식으로 매일 지정 시간에 실행
scheduler.add_job(
    daily_engagement_job,
    "cron",
    hour=eng_h,      # 예: 14시
    minute=eng_m,    # 예: 0분
    id="daily_engagement",
    replace_existing=True,
)
```

### 잡 동적 갱신

`update_engagement_job()` — 설정 변경 시 스케줄러 재시작 없이 잡만 교체

---

## 4. 전체 참여 실행 (blog_engagement.py)

### `run_engagement()` → `_run_engagement_impl()`

**흐름:**

1. Playwright 브라우저 생성 (`create_stealth_context` — 스텔스 모드)
2. 네이버 로그인 (`login()`)
3. 포스팅 수집 (`collect_blog_posts()`)
4. 각 포스팅에 대해 `engage_single_post()` 호출
5. **포스팅 간 8~20초 랜덤 대기**
6. 결과 집계 후 반환

**반환값:**

```python
{
    "account_id": int,
    "total_posts": int,
    "like_count": int,
    "comment_count": int,
    "results": [  # 각 포스팅별 결과
        {
            "post_url": str,
            "post_title": str,
            "like_success": bool,
            "comment_success": bool,
            "comment_text": str,
            "error": str,
        }
    ],
    "error": str,
}
```

**Windows 호환:**

```python
if sys.platform == "win32":
    return await asyncio.to_thread(
        _run_in_proactor_loop, _run_engagement_impl, ...
    )
```

---

## 5. 포스팅 수집 (`collect_blog_posts`)

### 경로: 네이버 메인 → 블로그 → 주제별 보기

1. `https://www.naver.com/`으로 이동
2. "블로그" 링크 URL 추출 후 goto
   - 폴백: `https://section.blog.naver.com/BlogHome.naver` 직접 이동
3. "주제별 보기" 탭 클릭 (SPA 내부 라우팅)
   - 방법 1: Playwright 텍스트 셀렉터 (`a:has-text("주제별 보기")`)
   - 방법 2: JS 클릭 폴백 (DOM에서 텍스트 매칭)
   - 방법 3: `https://section.blog.naver.com/ThemePost.naver` 직접 이동
4. 스크롤 다운으로 포스팅 더 로드 (5회 × 600px)
5. JS로 포스트 URL 수집

### URL 검증 (엄격 모드)

**허용하는 URL 패턴 (3가지만):**

```javascript
// 1) blog.naver.com/사용자/포스트번호 (가장 일반적)
/blog\.naver\.com\/[^\/\?]+\/[0-9]{6,}/

// 2) PostView.naver?logNo=...
url.includes('/PostView.naver') && url.includes('logNo=')

// 3) section.blog.naver.com/...detail...logNo
url.includes('section.blog.naver.com') && url.includes('/detail') && url.includes('logNo=')
```

**제외하는 URL 패턴:**

```javascript
const excludePatterns = [
    'seller.blog.naver.com',
    '/BlogHome', '/PostList.naver', '/my-log', '/market',
    '/neighborlog', '/SympathyHistoryList',
    '/ProfileView', '/profile',
];
```

**사이드바 제외:** `.aside`, `[class*="sidebar"]`, `[class*="my_news"]` 등 내부 링크 무시

**Python 단 이중 검증:** JS 필터 통과한 URL을 정규식으로 다시 확인

---

## 6. 포스팅 내용 읽기 (`read_post_content`)

### 네이버 블로그 구조 특성

네이버 블로그는 `mainFrame`이라는 iframe 안에 실제 본문이 있음. 외부 페이지는 네비게이션/사이드바만 포함.

### 본문 추출 4단계 폴백

```python
# 1차: mainFrame 우선 추출 (본문은 대부분 여기)
content_data = await main_frame.evaluate(EXTRACT_JS)

# 2차: mainFrame에서 못 찾으면 외부 페이지
content_data = await page.evaluate(EXTRACT_JS)

# 3차: 다른 iframe 탐색
for frame in page.frames: ...

# 4차: 3초 대기 후 mainFrame 재시도 (지연 로딩 대비)
await asyncio.sleep(3)
content_data = await main_frame.evaluate(EXTRACT_JS)
```

### 본문 추출 JS

```javascript
// 제목 셀렉터
'.se-title-text, .pcol1, .htitle, .se-fs-, h3.se_textarea, '
+ '[class*="title"] span, .post-title, .tit_h3'

// 본문 셀렉터
'.se-main-container, .se-component.se-text, '
+ '#postViewArea, #post-view, .post_ct'
```

**본문은 최대 2000자로 제한** (AI 댓글 생성용)

### 포스트 페이지 검증 (`is_actual_post_page`)

블로그 홈으로 리다이렉트된 경우 감지:

1. URL 패턴 체크 (`/BlogHome`, `/PostList.naver` 등 → False)
2. URL에 포스트 번호 있으면 → True
3. DOM 기반 검증: 본문 요소 존재 여부 (`se-main-container`, `#postViewArea` 등)
4. 블로그 홈 특징 감지 (`blog_category`, `category_list` 등)
5. 판별 불가 시 → False (안전 우선)

---

## 7. 단일 포스팅 참여 (`engage_single_post`)

### 핵심: 공감 클릭과 AI 댓글 생성을 병렬 실행

```python
# 공감 클릭(~2초)하는 동안 AI 댓글(~3-5초)을 백그라운드에서 동시 생성
comment_future = asyncio.get_event_loop().run_in_executor(
    None, generate_comment, api_key, post_title, post_content,
)

# 공감 클릭 (Playwright 비동기)
like_result = await click_like(page)

# AI 댓글 결과 대기 (이미 완료되었을 가능성 높음)
comment_text = await comment_future

# 댓글 작성
comment_result = await write_comment(page, comment_text)
```

### 흐름

1. `read_post_content()` — 포스트 본문 추출
2. 블로그 홈 리다이렉트 감지 시 즉시 스킵
3. AI 댓글 생성 시작 (비동기 executor)
4. `click_like()` — 공감 클릭
5. 공감 후 페이지 이탈 감지 → 원래 포스트로 복귀
6. 본문 미추출 시 공감 완료 후 mainFrame 본문 재추출 시도
7. `write_comment()` — 댓글 작성

---

## 8. 공감(좋아요) 클릭 (`click_like`)

**가장 복잡한 부분. 네이버 블로그의 iframe 구조 + 플로팅 바 + 리액션 피커 때문에 다단계 전략 필요.**

### 8-1. 공감 버튼 찾기 (`_find_like_button`)

#### 탐색 우선순위 3단계

**1단계: mainFrame 내부 (실제 공감 API를 트리거하는 진짜 버튼)**

```python
MAIN_FRAME_SELECTORS = [
    '.area_sympathy .u_likeit_list_module .u_likeit_btn',
    '.area_sympathy .u_likeit_btn',
    '#sympathyArea .u_likeit_btn',
    '.area_sympathy a[role="button"]',
    '#sympathyArea a[role="button"]',
    '.u_likeit_list_module .u_likeit_btn',
    '.u_likeit_btn',
]
```

- 공감 영역까지 스크롤 (`_scroll_to_sympathy_area`) + AJAX 핸들러 바인딩 대기 (3초)
- 광고 요소 제외 (`power_link`, `ad_`, `revenue_unit`)
- "공감" 텍스트 폴백 탐색

**2단계: 외부 페이지 플로팅 바 (하단 고정 바의 하트 버튼)**

```javascript
// position:fixed 또는 sticky 컨테이너 스캔
// 하단 150px 내, 높이 10~200px
// like, sympathy, heart, u_likeit 관련 클래스 탐색
```

**3단계: 기타 프레임 폴백**

```python
OUTER_SELECTORS = [
    '.u_likeit_list_module .u_likeit_btn',
    '.u_likeit_btn',
    '.btn_like',
    'button.like_btn',
    'a.like_btn',
]
```

### 8-2. 공감 영역 스크롤 (`_scroll_to_sympathy_area`)

```python
SYMPATHY_AREA_SELS = (
    '.area_sympathy, #sympathyArea, .u_likeit_list_module, '
    '.post_sympathy, [data-module="sympathy"], .se-module-oglink, '
    '.u_likeit_btn'
)
```

1. 이미 있으면 `scrollIntoView({ block: "start" })` + 3초 대기
2. 없으면 800px씩 12회 점진적 스크롤 (AJAX 트리거)

### 8-3. 클릭 실행 전략

#### 전략 A: mainFrame 버튼 (`_click_mainframe_like`)

**플로팅 바 숨김 후 4가지 방법 시도:**

```
방법 1: locator.click(force=True)     — Playwright 기본
방법 2: JS element.click()            — DOM 직접 클릭
방법 3: dispatchEvent(MouseEvent)     — mousedown → mouseup → click 시퀀스
방법 4: 좌표 기반 page.mouse.click()  — iframe 오프셋 보정 후 절대 좌표
```

**각 방법 후 0.8초 대기 → `.on` 클래스로 성공 여부 즉시 검증:**

```javascript
const btn = document.querySelector(
    '.area_sympathy .u_likeit_btn, .u_likeit_btn, '
    + '#sympathyArea a[role="button"]'
);
return btn ? btn.classList.contains('on') : false;
```

#### 전략 B: 플로팅 바 / 외부 프레임 버튼

- 좌표 기반 `page.mouse.click(cx, cy)`
- locator.click 폴백

#### 전략 C: mainFrame 실패 → 플로팅 바 폴백 (`_click_floating_bar_like`)

#### 플로팅 바 숨김/복원

```python
# 숨김: mainFrame 클릭 전
async def _hide_floating_bar(page):
    # position:fixed/sticky, 하단 150px 내 요소를 display:none으로 숨김
    el.setAttribute('data-hidden-by-bot', el.style.display)
    el.style.setProperty('display', 'none', 'important')

# 복원: 클릭 완료 후
async def _restore_floating_bar(page):
    # data-hidden-by-bot 속성이 있는 요소의 원래 display 복원
```

### 8-4. 리액션 피커 처리 (`_handle_reaction_picker`)

2025.09부터 네이버 블로그는 하트 클릭 시 6종 리액션 피커 출현:

```
좋아요 | 감동 | 도움 | 최고 | 재밌 | 응원
```

**처리 로직:**

- 최대 3초 동안 0.5초 간격으로 6회 반복 체크
- 모든 프레임(최대 8개)에서 리액션 레이어 탐색

```javascript
// 레이어 셀렉터
const sels = [
    '.u_likeit_layer', '[class*="likeit_layer"]',
    '[class*="reaction_layer"]', '[class*="sympathy_layer"]',
    '.u_likeit_module .u_likeit_layer',
    '.u_likeit_list_layer', '.layer_sympathy',
    '[class*="like_layer"]', '[class*="emotion_layer"]',
    '[class*="likeit_list_layer"]',
];
```

- 첫 번째 리액션(좋아요) 좌표 클릭
- mainFrame이면 iframe 오프셋 보정

```python
if check_frame.name == 'mainFrame':
    off = await page.evaluate('''() => {
        const f = document.querySelector('iframe[name="mainFrame"]');
        const r = f.getBoundingClientRect();
        return {x: r.left, y: r.top};
    }''')
    rx += off.get('x', 0)
    ry += off.get('y', 0)
```

### 8-5. 전체 재시도 로직

```
1차 시도 → .on 확인 → 성공!
1차 시도 → .on 미확인 → 플로팅 바로 재시도 → 리액션 피커 재확인 → .on 확인
                                            → .on 미확인 → 클릭은 수행했으므로 성공 처리
```

---

## 9. AI 댓글 생성 (`generate_comment`)

### Claude API 호출 (동기 함수 → `run_in_executor`로 비동기 실행)

```python
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
```

### 후처리

```python
comment = message.content[0].text.strip()
comment = comment.strip('"').strip("'").strip('\u201c').strip('\u201d')  # 따옴표 제거
comment = comment.split("\n")[0].strip()  # 줄바꿈 시 첫 줄만
```

---

## 10. 댓글 작성 (`write_comment`)

### 2단계 전략: API 우선, UI 폴백

### 전략 1: API 직접 호출 (`write_comment_via_api`) — 가장 안정적

UI 조작 없이 HTTP POST로 댓글 등록. iframe 렌더링/타이밍 이슈 완전 회피.

**1. cbox iframe URL 찾기**

```python
for f in page.frames:
    f_url = (f.url or '')
    if 'cbox' in f_url.lower() and 'apis.naver.com' in f_url.lower():
        cbox_url = f_url
        break
```

mainFrame 내부에서 DOM 탐색 폴백:

```javascript
const iframes = document.querySelectorAll('iframe');
for (const iframe of iframes) {
    const src = iframe.src || iframe.getAttribute('data-src') || '';
    if (src.includes('cbox') && src.includes('apis.naver.com')) {
        return src;
    }
}
```

**2. URL에서 필수 파라미터 추출**

```python
from urllib.parse import urlparse, parse_qs

parsed = urlparse(cbox_url)
params = parse_qs(parsed.query)

ticket = params.get('ticket', [None])[0]        # 필수
pool = params.get('pool', [None])[0]              # 필수
object_id = params.get('objectId', [None])[0]     # 필수
lang = params.get('lang', ['ko'])[0]
_cv = params.get('_cv', [None])[0]                # 클라이언트 버전
consumerKey = params.get('consumerKey', [None])[0]
```

**3. API 호출**

```python
comment_api_url = f"{api_base}/commentbox/cbox/web_naver_blog_comment_write.json"

form_data = {
    "ticket": ticket,
    "pool": pool,
    "objectId": object_id,
    "lang": lang,
    "contents": comment_text,
    "mimeType": "text",
}
if _cv:
    form_data["_cv"] = _cv
if consumerKey:
    form_data["consumerKey"] = consumerKey

headers = {
    "Referer": cbox_url,
    "Origin": api_base,
}

# page.request.post() → 브라우저 쿠키 자동 포함
response = await page.request.post(
    comment_api_url,
    form=form_data,
    headers=headers,
    timeout=15000,
)
```

**4. 응답 검증**

```python
if status == 200:
    body_json = json.loads(body_text)
    api_status = str(body_json.get("result", {}).get("status", "")).upper()
    if api_status in ("SUCCESS", "OK", "CREATED"):
        # 성공
    elif body_json.get("success"):
        # 성공
    else:
        # API 응답 에러
```

### 전략 2: UI 조작 (API 실패 시 폴백)

#### 단계 0: cbox 도메인 쿠키 워밍업

```python
# third-party cookie 차단 대응
from se_helpers import _share_cookies_for_cbox
await _share_cookies_for_cbox(page.context)
warmup_page = await page.context.new_page()
await warmup_page.goto("https://cbox5.apis.naver.com/", timeout=8000)
await warmup_page.close()
```

#### 단계 1: 댓글 영역 로딩

1. mainFrame 스크롤 (본문 하단까지)
2. "댓글" 버튼 클릭 (12개 셀렉터 + JS 텍스트 탐색)

```python
comment_btn_selectors = [
    'a.btn_comment',
    '.area_comment a',
    'a[href*="#comment"]',
    '.u_likeit_list_btn._comment',
    'button._comment',
    'em.u_cnt._count',
    '.comment_count',
    'a[class*="comment"]',
    '.area_sympathy + * a',
    '[data-cbox-module]',
    'a[data-action="comment"]',
    '.post_footer a',
    '.wrap_postfoot a',
]
```

3. cbox iframe 폴링 (최대 4라운드 × 12번 = ~30초)

```python
def _find_cbox_in_frames():
    for f in page.frames:
        f_url = (f.url or '').lower()
        f_name = (f.name or '').lower()
        if ('cbox' in f_url or 'comment' in f_url or
            'cbox' in f_name or 'comment' in f_name or
            'reply' in f_url or 'reply' in f_name):
            return f
    return None
```

4. 폴백 iframe 탐색 (DOM 매칭 → mainFrame 인라인 → textarea 포함 프레임)

#### 단계 2: cbox 로그인 상태 확인

```javascript
// 로그인 버튼이 보이고, textarea/placeholder/writeArea 모두 없으면 → 미로그인
const loginBtnSelectors = [
    '.u_cbox_login_btn',
    '.u_cbox_btn_login',
    'a[href*="nidlogin"]',
    '.u_cbox_write_login',
];
```

**미로그인 시 복구:**

1. `_share_cookies_for_cbox()` — 쿠키 재공유
2. `nid.naver.com/nidlogin` + `cbox5.apis.naver.com` 도메인 워밍업
3. 페이지 새로고침 → 스크롤 → 댓글 버튼 재클릭 → cbox iframe 재탐색

#### 단계 3: 단일 JS로 댓글 입력 + 등록 (타이밍 이슈 최소화)

```javascript
// Step 1: placeholder 클릭으로 textarea 활성화
const placeholders = document.querySelectorAll(
    '.u_cbox_placeholder, .u_cbox_inbox, .u_cbox_write_wrap, '
    + '.u_cbox_write_box, .u_cbox_text'
);

// Step 2: textarea 또는 contenteditable 찾기
const taSels = [
    'textarea.u_cbox_text',
    'textarea[class*="u_cbox"]',
    '.u_cbox_write_wrap textarea',
    '.u_cbox_inbox textarea',
    'textarea[placeholder*="댓글"]',
    'textarea',
];

// Step 3: 네이티브 setter로 값 설정 (React controlled 컴포넌트 대응)
const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
)?.set;
nativeSetter.call(input, commentText);
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));

// Step 4: 등록 버튼 클릭
const btnSels = [
    'button.u_cbox_btn_upload', 'a.u_cbox_btn_upload',
    '.u_cbox_btn_upload', 'button.u_cbox_btn_register',
    '.u_cbox_btn_register',
];
// 폴백: 텍스트 "등록"으로 탐색
```

#### 단계 4: Playwright 방식 폴백 (단일 JS 실패 시)

```python
# placeholder 클릭
await comment_target.locator('.u_cbox_placeholder').first.click()

# textarea 찾기
comment_input = await try_selectors(comment_target, [
    'textarea.u_cbox_text', '.u_cbox_write_wrap textarea',
    'textarea[class*="u_cbox"]', ...
], timeout=6000)

# 타이핑 (랜덤 딜레이)
await comment_input.type(comment_text, delay=30 + random.randint(-10, 15))

# 등록 버튼 클릭
submit_btn = await try_selectors(comment_target, [
    'button.u_cbox_btn_upload', ...
], timeout=5000)
await submit_btn.click()
```

#### 단계 5: 등록 성공 검증

```javascript
{
    taFound: bool,        // textarea 존재 여부
    taEmpty: bool,        // textarea가 비워졌는지 (성공 지표)
    ceEmpty: bool,        // contenteditable가 비워졌는지
    hasError: bool,       // 에러 메시지 표시 여부
    errorText: string,    // 에러 내용
    hasLoginPopup: bool,  // 로그인 팝업 표시 여부
    commentCount: int,    // 댓글 수
}
```

**판정 기준:**

- 로그인 팝업 → 실패
- 에러 메시지 → 실패
- textarea 비워짐 → 성공
- contenteditable 비워짐 → 성공
- textarea 내용 잔존 → 불확실

---

## 11. 안전장치 / 안티 디텍션

| 항목 | 구현 |
|------|------|
| 랜덤 딜레이 | 모든 액션 사이 `random_delay()` (포스팅 간 8~20초, 계정 간 30~60초) |
| 스텔스 브라우저 | `create_stealth_context()` (navigator 위장, webdriver 플래그 제거 등) |
| 프록시 지원 | 계정별 프록시 설정 (`proxy_server`, `proxy_username`, `proxy_password`) |
| 블로그 홈 감지 | URL + DOM 이중 검증으로 잘못된 페이지에서 액션 방지 |
| 페이지 이탈 감지 | 공감 클릭 후 현재 URL 확인, 이탈 시 원래 포스트로 복귀 |
| 이미 공감 체크 | `.on` 클래스로 이미 공감한 글 스킵 |
| 광고 요소 제외 | `power_link`, `ad_`, `revenue_unit` 내부 버튼 무시 |
| 디버그 캡처 | 실패 시 `capture_debug()` 스크린샷 저장 |
| 배포 버전 확인 | `CODE_VERSION` 상수 + 마커 파일 생성 |

---

## 12. 이식 시 필요한 의존성

### Python 패키지

```
playwright          # 브라우저 자동화
anthropic           # Claude AI API (댓글 생성)
aiomysql            # 비동기 MySQL
apscheduler         # 스케줄러
cryptography        # AES-256 계정 암호화
```

### se_helpers.py에서 가져오는 함수들

| 함수 | 역할 |
|------|------|
| `create_stealth_context()` | 스텔스 Playwright 브라우저 컨텍스트 생성 |
| `login()` | 네이버 로그인 |
| `random_delay()` | 랜덤 대기 (min~max초) |
| `try_selectors()` | 여러 셀렉터 순차 시도하여 첫 번째 매칭 요소 반환 |
| `capture_debug()` | 디버그 스크린샷 저장 |
| `_get_proxy_for_account()` | 계정별 프록시 DB 조회 |
| `_share_cookies_for_cbox()` | cbox 도메인에 네이버 쿠키 공유 |
| `_run_in_proactor_loop()` | Windows ProactorEventLoop 호환 실행 |
| `_PROXY_CHECKED_NO_PROXY` | 프록시 없음 센티널 값 |

---

## 13. 함수 호출 관계도

```
run_engagement()
  └─ _run_engagement_impl()
       ├─ create_stealth_context()          ← se_helpers
       ├─ login()                           ← se_helpers
       ├─ collect_blog_posts()
       │    └─ JS: 포스팅 URL 수집 + 검증
       └─ [반복] engage_single_post()
            ├─ read_post_content()
            │    ├─ is_actual_post_page()
            │    └─ JS: 본문 추출 (4단계 폴백)
            ├─ generate_comment()            ← 병렬 (run_in_executor)
            │    └─ anthropic.Anthropic.messages.create()
            ├─ click_like()
            │    ├─ _find_like_button()
            │    │    └─ _scroll_to_sympathy_area()
            │    ├─ _click_mainframe_like()  (4가지 방법)
            │    │    ├─ _hide_floating_bar()
            │    │    └─ _restore_floating_bar()
            │    ├─ _click_floating_bar_like()
            │    ├─ _handle_reaction_picker()
            │    └─ _verify_like_success()
            └─ write_comment()
                 ├─ write_comment_via_api()  ← 전략 1 (API)
                 └─ UI 조작 폴백            ← 전략 2
                      ├─ _share_cookies_for_cbox()
                      ├─ _find_cbox_in_frames()
                      ├─ 단일 JS evaluate (입력+등록)
                      └─ Playwright 폴백 (type+click)
```
