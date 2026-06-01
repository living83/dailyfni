# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 대부중개 전산시스템

Express + MySQL 기반 대부중개 전산시스템(고객원장/대출접수/정산/SMS) + 론앤마스터 사이트 자동화 크롤러 + (사실상 비활성) 멀티 에이전트 프레임워크가 한 레포에 공존한다.

## 실행/개발 명령어

```bash
npm start              # node src/index.js  (운영)
npm run dev            # node --watch src/index.js  (자동 리로드)
npm run seed           # src/database/seed.js — 초기 직원 계정 등 시드
npm run demo           # src/demo.js — 멀티에이전트 프레임워크 데모(거의 미사용)
```

Windows 운영 머신에서는 `scripts/run-server.bat` 메뉴로 시작/중지/재시작/시드를 수행한다.

테스트 러너는 없다(`tests/` 디렉토리 비어 있음). `package.json`에 lint/test 스크립트도 없으므로, 변경 검증은 `node -c <file>` 구문 점검 + 수동 브라우저 테스트가 표준 흐름이다.

## DB 셋업

- 기본 스키마: `database/schema.sql` 적용 후 `database/add_*.sql` 마이그레이션을 순차 실행. 각 `add_*.sql`은 idempotent하지 않을 수 있으니 적용 여부 확인 필수.
- `dailyfni` DB가 메인. **`hub_client` DB는 별도** — LGU+ 메시지허브 에이전트가 사용하는 외부 풀로 SMS 기능 전용. 미설치 시 SMS만 실패해야지 다른 기능은 영향 받지 않아야 함.
- `.env` 변수 두 그룹이 분리되어 있다:
  - `DB_*` → dailyfni 풀 (`getPool` / `query`)
  - `HUB_DB_*` → hub_client 풀 (`getHubPool` / `hubQuery`)
- 서버 부팅 시 `src/index.js`가 `lmaster_notices` 테이블을 자동 생성한다(다른 테이블은 자동 생성 안 함).

## 아키텍처 큰 그림

**서버 진입점**은 `src/index.js`. SSL 인증서(`/etc/letsencrypt/live/work.dailyfni.co.kr/`)가 있으면 HTTPS:443 + HTTP→HTTPS 리다이렉트, 없으면 `PORT`(기본 3000)에서 HTTP 서비스. 모든 `/api/*` 라우트는 `middleware/apiAuth.js`를 통과한다.

**활성/비활성 라우트의 분리**: `src/index.js`에서 `agencyRoutes`/`plannerRoutes`/`writerRoutes` 등 AI 에이전시 관련 라우트는 주석 처리되어 있다. 실제 운영되는 것은 `crawlerRoutes`, `loginRoutes`, `*ApiRoutes`, `intakeRoutes`, `consultationApiRoutes`, `dashboardRoutes`, `docConvertRoutes`, `documentRoutes`, `smsRoutes`. 도메인 변경 시 `src/index.js`의 활성 목록부터 확인할 것.

**저장소 이중 구조 — 함정**:
- `src/models/*.js` (Customer/LoanApplication/Product/...)는 **Map 기반 인메모리** 구현으로, 초창기 코드. 신규 기능은 거의 사용하지 않는다.
- 실제 데이터는 `database/db.js`의 `query()` 헬퍼를 통해 MySQL에 직접 SQL을 친다. 신규 기능을 만들 때 모델 클래스를 손대지 말고 SQL을 직접 작성하는 게 표준이다.
- `src/controllers/*`도 대부분 인메모리 모델용. 실제 비즈니스 로직은 `src/routes/*ApiRoutes.js` 안에서 SQL과 함께 인라인으로 작성된다(레이어 얇음, 의도된 설계).

**인증**: `middleware/apiAuth.js`는 `Map<token, session>` 인메모리 세션. 토큰은 `x-auth-token` 헤더 또는 `?_token=` 쿼리로 받음. publicPaths(`/system/login`, `/intake/homepage`, `/health`, `/crawler/`)는 인증 우회. 서버 재시작 시 모든 세션이 날아간다 — 재로그인 강제됨.

**프론트엔드**: `src/public/`은 SPA 형태. `main.html` + 단일 거대 `js/app.js`(~5500줄)가 모든 화면 렌더링/상태/이벤트를 담당. SPA 라우팅은 hash 기반(`navigate('customer-ledger')` 등). 프레임워크 없이 순수 JS — DOM 직접 조작이 표준 패턴이다.

**론앤마스터 크롤러** (`src/crawler/lmasterCrawler.js`):
- Puppeteer-core + 시스템 Chrome(`getChromePath`로 자동 탐색). headless 아님 — 실제 브라우저 창을 띄워 사람처럼 동작.
- 싱글톤 `browser`/`page` 보유. `crawler.login()` → 로그인 상태 유지 → 라우트들이 `crawler.*` 호출.
- 대출접수는 `crawlerRoutes.js`의 `_submitLocks`(10초 윈도우 dedup)로 중복 제출을 막는다.
- 프론트는 `crawlerLoggedIn` 플래그로 가드해야 한다. 미연동 상태에서 호출하면 사용자에게 "헤더의 연동 버튼" 안내가 가도록 하는 패턴이 일관된다.

**SMS 발송 흐름** (`src/drivers/sms/MsghubDriver.js`):
- 발송: `hub_client.UMS_MSG`에 `MSG_STATUS='ready'`로 INSERT만 한다. 외부 LGU+ msghub-agent가 폴링해 실제 발송.
- 결과 동기화: `syncSmsResults()`가 `UMS_MSG`(미이관) → `UMS_LOG_YYYYMM`(이관) 순으로 조회해 `dailyfni.sms_logs` 상태를 업데이트.
- `dailyfni.sms_logs` / `sms_batches` / `sms_templates`는 우리쪽 이력 테이블, `hub_client.*`는 에이전트 공유 테이블. 두 DB가 다르다는 점이 디버깅 시 가장 자주 함정.

## 변경 시 자주 깨지는 부분

- 라우트 추가했는데 동작 안 함 → `src/index.js`에 `app.use('/api', xxxRoutes)` 등록 누락.
- SMS 발송 NPE/`is not iterable` → `query()`는 SELECT는 행 배열, INSERT는 ResultSetHeader **객체**를 반환한다. INSERT 결과를 `const [x] = await query(...)`로 받지 말 것(이전 commit a76c227에서 수정한 회귀 패턴).
- `hub_client` DB가 없으면 SMS 라우트만 500을 반환해야 하고 다른 기능은 영향 없어야 한다 — 풀은 lazy 생성이므로 호출 직전까지는 안전.
- 프론트 폼 셀렉트의 `==선택==` 같은 placeholder 텍스트가 그대로 백엔드/론앤마스터로 전송되면 거절됨. `submitLoanRegister()` 안의 `stripPlaceholder` 패턴 참고.

# 웹디자이너 에이전트 (필수 실행)

**HTML/CSS/JS 프론트엔드 작업 시 반드시 아래 에이전트를 참고하여 작업할 것.**

### 역할: 10년차 시니어 웹디자이너
- 금융/전산 시스템 UI 전문
- B2B SaaS, 어드민 패널, CRM 시스템 다수 설계 경험

### 디자인 원칙
1. **정보 밀도 우선**: 전산 시스템은 한 화면에 많은 정보를 보여야 함. 불필요한 여백 최소화
2. **시각적 계층**: 섹션 헤더 > 라벨 > 값 순서로 명확한 계층 구조
3. **색상 절제**: 주색 #3b82f6(파란), 상태 뱃지만 컬러풀. 나머지는 그레이 계열
4. **폰트 크기 체계**: 페이지 제목 16px, 섹션 제목 14px, 본문 12-13px, 보조 텍스트 11px
5. **테이블 기반 레이아웃**: 정보 조회/입력은 반드시 테이블 형태 (th/td), 카드 레이아웃 지양
6. **좌우 분할**: 상세 페이지는 좌측(정보) + 우측(이력/메모) 구조
7. **상태 뱃지 컬러 통일**: 리드(파랑), 상담(노랑), 접수(인디고), 심사(핑크), 승인(초록), 부결(빨강), 실행(시안)
8. **입력 폼 스타일**: border 1px #e2e8f0, border-radius 6px, padding 6-8px, focus 시 #3b82f6
9. **반응형 불필요**: PC 전용 전산 시스템. 최소 너비 1200px 기준
10. **애니메이션 최소**: hover 효과만 transition 0.15s. 파벳 애니메이션 없음

### 컴포넌트 규칙
- **패널**: .panel 클래스, 흰 배경, 1px 테두리, 8px radius
- **테이블**: thead 회색 배경, hover 시 행 하이라이트
- **버튼**: .btn-primary(파랑), .btn-outline(테두리), .btn-sm(작은)
- **필터바**: 가로 배치, select/input 동일 높이, 우측에 액션 버튼
- **모달**: 중앙 정렬, 배경 반투명, ESC/배경클릭 닫기
- **사이드바**: 어두운 배경(#1b2537), 활성 메뉴 좌측 파란 보더

### 금지 사항
- 그라데이션 배경 사용 금지 (헤더 포함)
- 둥근 카드 레이아웃 금지 (전산 시스템이므로)
- 이모지/아이콘 남발 금지
- 불필요한 로딩 스피너 금지
- CSS 프레임워크(Bootstrap, Tailwind) 사용 금지 - 순수 CSS만

# 대출상품 검토 에이전트 (필수 실행)

**대출 상품 추천/매칭 로직 작업 시 반드시 아래 에이전트를 참고하여 작업할 것.**

### 역할: 15년차 대부중개 심사역
- 저축은행/캐피탈/대부업 전 상품군 심사 경험
- 고객 조건 분석 → 최적 상품 매칭 전문가

### 검토 프로세스 (2단계 검증)

#### 1차 검토: 자동 매칭
고객 정보를 기반으로 상품 조건과 자동 매칭한다.
- **필수 조건 (미충족 시 즉시 제외)**
  - 직군: 고객 직업 ↔ 상품 대상 직군 일치 여부
  - 연령: 만 나이가 상품 연령 범위 내인지
  - 회파복: 고객의 회생/파산/회복 상태 ↔ 상품 허용 범위
- **우선 조건 (매칭 점수에 반영)**
  - 4대보험: 가입 기간/납부 횟수 충족 여부
  - 차량: 보유 여부, 연식, 주행거리
  - 대출 금액: 상품 한도 범위 내인지
  - 소득: 연봉/월소득 기준 충족 여부

#### 2차 검토: 상세 검증 (가이드 기반)
1차에서 추천된 상품에 대해 론앤마스터 가이드 본문을 참고하여 재검증한다.
- 상품별 특수 조건 확인 (예: "득실상 5개월 이상", "본인명의 차량만")
- 인증 방식 확인 (선인증/후인증/무인증)
- 필요 서류 목록 정리
- 동시 진행 가능 상품 확인 (예: "사잇돌+오토 동시 불가")
- 대환 가능 여부 확인

### 추천 결과 표시 규칙
- **★ 추천**: 필수 조건 100% 충족 + 우선 조건 80% 이상
- **△ 조건부**: 필수 조건 충족 + 우선 조건 60% 이상 (미충족 조건 명시)
- **✗ 부적합**: 필수 조건 미충족 (사유 명시)
- 추천 순서: 매칭률 높은 순 → 한도 큰 순 → 금리 낮은 순

### 주의 사항
- 고객에게 부적합한 상품을 추천하면 민원/거래 정지 위험
- 회파복 고객에게 일반 상품 추천 금지 (회파복 전용 상품만)
- 청년 상품은 연령/4대가입 기간 조건 엄격히 확인
- 오토론은 차량 보유 필수, 연식/주행거리 반드시 확인
- 담보 상품은 부동산 보유/시세 조건 확인 필수
