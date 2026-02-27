# Naver Cafe Macro - 프로젝트 레퍼런스 문서

> 추후 비슷한 프로젝트 개발 시 참조용
> 최종 업데이트: 2026-02-27

---

## 1. 프로젝트 개요

네이버 카페에 자동으로 글을 작성하고 댓글을 다는 매크로 시스템.
웹 UI에서 계정/게시판/키워드/댓글/스케줄을 관리하고, Selenium으로 실제 브라우저를 조작하여 게시글을 발행한다.

### 핵심 기능
- 쿠키 기반 네이버 로그인 (ID/PW 로그인 폴백)
- 카페 글쓰기 (SE ONE 에디터 자동화)
- 댓글 자동 작성 (다계정 교차)
- 키워드 → 게시판 자동 매칭
- 저품질 방지 로직 (교차 발행, 계정 간격, 랜덤 딜레이)
- 실시간 진행 상태 SSE 스트리밍

---

## 2. 기술 스택

| 구분 | 기술 | 버전 | 용도 |
|------|------|------|------|
| Backend | Python | 3.12 | 서버 런타임 |
| Web Framework | FastAPI | 0.115.6 | REST API + SSE |
| ASGI Server | Uvicorn | 0.34.0 | HTTP 서버 |
| 브라우저 자동화 | Selenium | 4.27.1 | Chrome WebDriver |
| 스케줄러 | APScheduler | 3.10.4 | Cron 기반 배치 |
| 암호화 | cryptography | 44.0.0 | AES-256-GCM |
| 검증 | Pydantic | 2.10.4 | 요청/응답 검증 |
| DB | SQLite | 내장 | WAL 모드, 단일 파일 |
| Frontend | React | CDN | SPA (단일 HTML) |

### 의존성 설치
```bash
pip install fastapi==0.115.6 uvicorn==0.34.0 pydantic==2.10.4 \
    cryptography==44.0.0 apscheduler==3.10.4 selenium==4.27.1 python-dotenv==1.0.1
```

---

## 3. 프로젝트 구조

```
naver-cafe-macro/
├── backend/
│   ├── main.py              # FastAPI 서버 & REST API (366줄)
│   ├── database.py          # SQLite CRUD (531줄)
│   ├── scheduler.py         # APScheduler 배치 발행 (634줄)
│   ├── cafe_publisher.py    # Selenium 네이버 카페 자동화 (1708줄)
│   ├── content_generator.py # 콘텐츠 템플릿 생성 (419줄)
│   ├── crypto.py            # AES-256-GCM 암호화 (44줄)
│   └── seed_data.py         # 초기 시드 데이터 (453줄)
├── frontend/
│   └── index.html           # React SPA (빌드된 파일)
├── src/
│   └── NaverCafeMacro.jsx   # React 소스 (멀티탭 UI)
├── data/
│   ├── cafe_macro.db        # SQLite DB
│   └── .master_key          # AES 마스터키
├── requirements.txt
├── run.bat                  # Windows 실행 스크립트
└── run.sh                   # Linux/macOS 실행 스크립트
```

---

## 4. 데이터베이스 스키마

### 핵심 테이블

```sql
-- 계정 (네이버 로그인 정보)
accounts (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,           -- 네이버 ID
    password_enc TEXT,              -- AES-256 암호화된 비밀번호
    cookie_data TEXT,               -- JSON 쿠키 (세션 유지)
    active INTEGER DEFAULT 1,
    last_published_at TEXT          -- 마지막 발행 시각 (ISO8601)
);

-- 카페 게시판
cafe_boards (
    id INTEGER PRIMARY KEY,
    cafe_url TEXT,                  -- 카페 숫자ID 또는 alias
    board_name TEXT,                -- 게시판 이름 (예: "자동차대출")
    menu_id TEXT DEFAULT '',        -- 네이버 menuId (숫자)
    active INTEGER DEFAULT 1,
    last_published_at TEXT
);

-- 키워드 (글 주제)
keywords (
    id INTEGER PRIMARY KEY,
    text TEXT UNIQUE,               -- 예: "자동차할부"
    used_count INTEGER DEFAULT 0,   -- 사용 횟수 (순환용)
    last_used_at TEXT
);

-- 키워드 → 게시판 N:M 매핑
keyword_board_mapping (
    keyword_id INTEGER,
    board_id INTEGER,
    PRIMARY KEY (keyword_id, board_id)
);

-- 키워드 → 댓글 템플릿 N:M 매핑
keyword_comment_mapping (
    keyword_id INTEGER,
    comment_template_id INTEGER,
    PRIMARY KEY (keyword_id, comment_template_id)
);

-- 스케줄 설정 (싱글턴 row, id=1)
schedule_config (
    days TEXT DEFAULT '1,1,1,1,1,0,0',    -- 월~일
    times TEXT DEFAULT '08:00',
    interval_min INTEGER DEFAULT 5,        -- 계정 간 발행 간격(분)
    random_delay_min/max INTEGER,          -- 랜덤 딜레이(초)
    comment_enabled INTEGER DEFAULT 1,
    comments_per_post INTEGER DEFAULT 6,
    cross_publish INTEGER DEFAULT 1,       -- 교차 발행
    account_interval_hours INTEGER DEFAULT 3,
    max_accounts_per_run INTEGER DEFAULT 30,
    daily_shift_minutes INTEGER DEFAULT 30 -- 일별 시간 오프셋
);
```

---

## 5. 핵심 아키텍처 패턴

### 5.1 발행 플로우

```
스케줄러 트리거 (Cron)
  └→ execute_batch_job()
       ├→ 요일 체크 + 일별 오프셋 대기
       ├→ 발행 가능 계정 선택 (interval_hours 필터)
       └→ 계정별 순차 발행 (interval_min 간격)
            └→ _publish_single(account, config)
                 ├→ 키워드 선택 (최소 사용 우선)
                 ├→ 게시판 선택 (매핑 → 자동매칭 → 전체)
                 ├→ 랜덤 딜레이
                 ├→ 콘텐츠 생성 (제목 + 본문)
                 ├→ publish_to_cafe() → Selenium 실행
                 └→ 댓글 자동 작성 (다계정)
```

### 5.2 게시판 자동 매칭 로직

키워드 텍스트와 게시판 이름 간 부분문자열 매칭:

```python
# 우선순위:
# 1. 명시적 keyword_board_mapping이 있으면 → 해당 게시판
# 2. 없으면 → 키워드 텍스트로 게시판 이름 자동 매칭
# 3. 매칭 실패 → 전체 활성 게시판 폴백

# 매칭 점수 계산:
# - 게시판 이름이 키워드에 완전 포함: len(board_name) × 10
# - 키워드가 게시판 이름에 완전 포함: len(keyword) × 10
# - 부분 매칭: 가장 긴 공통 부분문자열 길이
# - 최소 2글자 이상 매칭 필요

# 예시:
# 키워드 "자동차할부" → 게시판 "자동차대출" (공통: "자동차", 30점)
# 키워드 "개인파산대출" → 게시판 "개인파산대출" (완전일치, 60점)
```

### 5.3 저품질 방지 전략

| 전략 | 설명 |
|------|------|
| 교차 발행 | 같은 카페 연속 발행 금지 |
| 계정 간격 | 동일 계정 최소 3시간 대기 (±30분 지터) |
| 발행 간격 | 계정 간 5분 간격 |
| 랜덤 딜레이 | 발행 전 10~120초 랜덤 대기 |
| 일별 시프트 | 매일 시작 시각 30분씩 이동 (최대 4시간) |
| 키워드 순환 | 최소 사용 키워드 우선 |
| 게시판 순환 | 가장 오래 전 발행된 게시판 우선 (LRU) |

### 5.4 SSE (Server-Sent Events) 실시간 상태

```python
# FastAPI SSE 엔드포인트
@app.get("/api/events")
async def event_stream(request: Request):
    queue = asyncio.Queue()
    async def callback(event, data):
        await queue.put({"event": event, "data": data})
    scheduler.register_progress_callback(callback)
    # ... yield SSE events ...
```

프론트엔드에서 `EventSource`로 실시간 수신.

---

## 6. SE ONE 에디터 자동화 - 핵심 교훈

### 6.1 텍스트 입력 방법 비교

| 방법 | DOM 반영 | 에디터 모델 반영 | 결과 |
|------|---------|----------------|------|
| `element.send_keys()` | O | O | **성공** |
| `ActionChains.send_keys()` | O | O | **성공 (추천)** |
| CDP `Input.insertText` | O | X | 실패 (플레이스홀더 유지) |
| `document.execCommand('insertText')` | O | X | 실패 |
| JavaScript `element.value = ...` | O | X | 실패 |

**결론: SE ONE 에디터는 반드시 네이티브 키보드 이벤트(ActionChains)로 입력해야 함.**

```python
# 올바른 방법
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys

# 본문 입력
body_area = driver.find_element(By.CSS_SELECTOR, ".se-component-content .se-text-paragraph")
ActionChains(driver).click(body_area).perform()
ActionChains(driver).send_keys("안녕하세요!").perform()
ActionChains(driver).send_keys(Keys.ENTER).perform()
```

### 6.2 카페 ID 해석

```
/ca-fe/cafes/{cafe_id}/articles/write?boardType=L&menuId={menu_id}
```

**반드시 숫자 cafe_id만 사용.** alias(예: "smartcredit") 사용 시 www.naver.com으로 리다이렉트됨.

```python
# cafe_id 해석 전략 (우선순위)
1. Naver API (CafeGateInfo.json) → clubId 추출
2. URL 리다이렉트 감지 (/cafes/{numeric_id})
3. 페이지 소스 정규식 (clubid=\d+)
4. JavaScript DOM 탐색
5. 동기 XHR API 호출

# 중요: isdigit() 체크 필수 — 실패 시 alias 그대로 반환하면 안 됨
```

### 6.3 게시판 선택 (드롭다운)

SE ONE 에디터의 게시판 드롭다운은 Vue 포탈로 렌더링됨:

```python
# 1. 드롭다운 열기
select_btn = driver.find_element(By.CSS_SELECTOR, "a.select_board, button.select_board")
select_btn.click()

# 2. 게시판 옵션 클릭 (Vue 포탈 → document.body에 렌더링)
options = driver.find_elements(By.CSS_SELECTOR, "ul.select_list li button.option")
for opt in options:
    if board_name in opt.text:
        opt.click()
        break
```

---

## 7. 주요 이슈 & 해결 과정

### 7.1 글 내용 미인식 (플레이스홀더 잔존)

- **증상**: 등록 버튼 클릭 시 "내용을 입력하세요." 알림 → 실패
- **원인**: CDP `Input.insertText`는 DOM만 변경하고, SE ONE 에디터 내부 모델은 업데이트하지 않음
- **해결**: 모든 텍스트 입력을 `ActionChains.send_keys()`로 전면 교체
- **교훈**: **에디터 내부 상태는 네이티브 키보드 이벤트로만 업데이트됨**

### 7.2 글쓰기 페이지 타임아웃 (리다이렉트)

- **증상**: 글쓰기 페이지 이동 후 www.naver.com으로 리다이렉트 → 타임아웃
- **원인**: URL에 문자열 alias가 들어감 (숫자 ID만 지원)
- **해결**:
  1. WebDriverWait로 페이지 로드 완전 대기
  2. 도메인 이탈 감지 시 즉시 실패 반환
  3. 에디터 탐색 전 URL 검증
  4. 타임아웃 15초 → 30초 증가

### 7.3 게시판 매핑 불일치

- **증상**: 키워드 "자동차할부"가 "개인파산대출" 게시판에 게시됨
- **원인**: keyword_board_mapping 비어 있으면 전체 활성 게시판에서 LRU 선택
- **해결**: 키워드 텍스트 ↔ 게시판 이름 자동 매칭 로직 추가
  - 부분문자열 매칭 (최소 2글자)
  - 완전 포함 시 높은 점수
  - 매칭 실패 시 전체 게시판 폴백

### 7.4 CTA 테이블 렌더링 실패

- **증상**: 1×1 테이블 CTA가 에디터에서 제대로 생성되지 않음
- **해결**: 테이블 대신 구분선 + 텍스트 CTA로 교체
- **교훈**: SE ONE 에디터의 테이블 기능은 프로그래밍으로 제어하기 어려움

---

## 8. 암호화 (AES-256-GCM)

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, base64

# 키 생성 (최초 1회)
key = AESGCM.generate_key(bit_length=256)
with open(".master_key", "wb") as f:
    f.write(base64.b64encode(key))

# 암호화
nonce = os.urandom(12)
aesgcm = AESGCM(key)
ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
encrypted = base64.b64encode(nonce + ciphertext).decode()

# 복호화
raw = base64.b64decode(encrypted)
nonce, ciphertext = raw[:12], raw[12:]
plaintext = aesgcm.decrypt(nonce, ciphertext, None).decode()
```

---

## 9. API 엔드포인트 요약

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/accounts` | GET/POST | 계정 목록/추가 |
| `/api/accounts/{id}` | DELETE | 계정 삭제 |
| `/api/accounts/{id}/toggle` | PUT | 계정 활성/비활성 |
| `/api/boards` | GET/POST | 게시판 목록/추가 |
| `/api/boards/{id}` | DELETE | 게시판 삭제 |
| `/api/keywords` | GET/POST | 키워드 목록/추가 |
| `/api/keywords/{id}` | DELETE | 키워드 삭제 |
| `/api/keywords/{id}/boards` | GET/PUT | 키워드-게시판 매핑 |
| `/api/keywords/{id}/comments` | GET/PUT | 키워드-댓글 매핑 |
| `/api/comments/templates` | GET/POST | 댓글 템플릿 |
| `/api/schedule` | GET/PUT | 스케줄 설정 |
| `/api/scheduler/start` | POST | 스케줄러 시작 |
| `/api/scheduler/stop` | POST | 스케줄러 중지 |
| `/api/scheduler/run-once` | POST | 수동 1회 발행 |
| `/api/history` | GET | 발행 이력 |
| `/api/stats` | GET | 통계 |
| `/api/events` | GET | SSE 실시간 스트림 |
| `/api/seed/reset` | POST | 시드 데이터 리셋 |

---

## 10. 실행 방법

```bash
# Windows
run.bat

# Linux/macOS
chmod +x run.sh && ./run.sh

# 서버 시작 후 http://localhost:8001 접속
```

`run.bat`이 자동으로:
1. Python 확인
2. venv 생성 (없으면)
3. 패키지 설치
4. `backend/main.py` 실행

---

## 11. 새 프로젝트에 재사용할 때 체크리스트

### 필수 변경
- [ ] `seed_data.py`: 키워드 카테고리 & 댓글 템플릿 교체
- [ ] `content_generator.py`: 콘텐츠 템플릿 교체
- [ ] `cafe_publisher.py`: 대상 플랫폼에 맞게 Selenium 로직 수정

### 그대로 재사용 가능
- [x] `database.py`: 스키마 & CRUD (범용적)
- [x] `scheduler.py`: 배치 발행 + 저품질 방지 로직
- [x] `crypto.py`: 암호화 모듈
- [x] `main.py`: FastAPI REST API + SSE 패턴
- [x] `run.bat` / `run.sh`: 실행 스크립트

### 핵심 설계 원칙 (그대로 적용)
1. **쿠키 우선 로그인** → ID/PW 폴백
2. **네이티브 키보드 이벤트** → 에디터 자동화의 유일한 방법
3. **교차 발행 + 랜덤 딜레이** → 저품질 방지 필수
4. **키워드-게시판 자동 매칭** → 수동 매핑 불필요
5. **SSE 실시간 스트리밍** → 긴 작업의 진행 상태 표시
6. **싱글턴 설정 테이블** → 스케줄 설정 관리

---

## 12. 시드 데이터 카테고리 (19개)

| 카테고리 | 영문키 | 키워드 수 | 예시 |
|---------|--------|----------|------|
| 주택담보대출 | mortgage | 20 | 주택담보대출금리, LTV대출한도 |
| 아파트 | apt | 20 | 아파트담보대출, 입주잔금대출 |
| 빌라/다세대 | villa | 14 | 빌라담보대출, 다가구주택대출 |
| 오피스텔/상가 | officetel | 12 | 오피스텔담보대출, 상가대출 |
| 토지/전원주택 | land | 11 | 토지담보대출, 공장담보대출 |
| 지역별 | regional | 9 | 서울아파트담보대출 |
| 후순위 | junior | 12 | 후순위담보대출, 3순위담보대출 |
| 전세/월세 | jeonse | 16 | 전세대출, 버팀목전세자금대출 |
| 신용대출 | credit | 15 | 직장인신용대출, 마이너스통장 |
| 대환/갈아타기 | refinance | 15 | 대환대출, 바꿔드림론 |
| 소액/비상금 | small | 15 | 100만원대출, 즉시대출 |
| 무직자/주부 | unemployed | 18 | 무직자대출, 프리랜서대출 |
| 저신용 | lowcredit | 15 | 7등급대출, 신용회복대출 |
| 개인회생/파산 | debt | 17 | 개인회생대출, 채무통합 |
| 정부지원 | government | 20 | 햇살론, 디딤돌대출 |
| 사업자 | business | 18 | 소상공인대출, 창업대출 |
| 자동차 | auto | 15 | 자동차할부, 오토론 |
| 금융기관별 | institution | 23 | 저축은행대출, 카카오뱅크대출 |
| 특수목적 | special | 15 | 학자금대출, 인테리어대출 |

---

## 13. 댓글 템플릿 그룹 → 카테고리 매핑

```python
CATEGORY_COMMENT_GROUPS = {
    "mortgage":    [COMMON, LOAN, MORTGAGE],        # 주택담보
    "apt":         [COMMON, LOAN, MORTGAGE],        # 아파트
    "villa":       [COMMON, LOAN, MORTGAGE],        # 빌라
    "officetel":   [COMMON, LOAN, MORTGAGE],        # 오피스텔
    "land":        [COMMON, LOAN, MORTGAGE],        # 토지
    "regional":    [COMMON, LOAN, MORTGAGE],        # 지역별
    "junior":      [COMMON, LOAN, MORTGAGE, JUNIOR],# 후순위
    "jeonse":      [COMMON, LOAN, JEONSE],          # 전세
    "credit":      [COMMON, LOAN],                  # 신용대출
    "refinance":   [COMMON, LOAN, REFINANCE],       # 대환
    "small":       [COMMON, LOAN, SMALL_LOAN],      # 소액
    "unemployed":  [COMMON, LOAN, HARD_CASE],       # 무직자
    "lowcredit":   [COMMON, LOAN, HARD_CASE, LOW_CREDIT], # 저신용
    "debt":        [COMMON, DEBT],                  # 채무/파산
    "government":  [COMMON, LOAN, GOV_LOAN],        # 정부지원
    "business":    [COMMON, LOAN, BUSINESS],        # 사업자
    "auto":        [COMMON, LOAN, AUTO],            # 자동차
    "institution": [COMMON, LOAN, INSTITUTION],     # 금융기관
    "special":     [COMMON, LOAN, SPECIAL],         # 특수목적
}
```

---

*이 문서는 프로젝트의 전체 구조, 기술적 결정, 이슈 해결 과정을 기록한 레퍼런스입니다.*
