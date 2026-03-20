# 프로젝트 메모

## 실행 방법
- **백그라운드 실행 (권장)**: 루트의 `run-background.bat` 실행 → 창을 닫아도 서버 유지
- **콘솔 실행**: 루트의 `run.bat` 실행 → Blog(8000) + Cafe(8001) 동시 시작 (창 닫으면 종료)
- **개별 실행**: `blog-generator/run.bat` 또는 `naver-cafe-macro/run.bat`
- `python backend/main.py` 직접 실행 X → 반드시 `run.bat` 또는 `run-background.bat` 사용
- `run.bat` / `run-background.bat`이 venv 생성, 패키지 설치, 서버 실행을 자동 처리

## 서버 관리
- **상태 확인**: `status.bat` → 각 서버 실행 여부 + PID 표시
- **서버 중지**: `stop.bat` → 포트 기반으로 서버 프로세스 종료
- **로그 확인**: `logs\blog.log`, `logs\cafe.log` (백그라운드 실행 시)

## 서버 포트
- Blog Generator: http://localhost:8000
- Cafe Macro: http://localhost:8001

## 안내 시 주의
- 사용자에게 실행 안내할 때: `git pull` 후 루트 `run-background.bat` 실행 (창 닫아도 서버 유지)

## 프로젝트 구조

| 컴포넌트 | 경로 | 포트 | 설명 |
|----------|------|------|------|
| Blog Generator | `/blog-generator` | 8000 | 네이버 블로그 자동 생성/발행 (FastAPI + Playwright) |
| Cafe Macro | `/naver-cafe-macro` | 8001 | 네이버 카페 자동 발행 (FastAPI + Selenium) |

## 발견된 이슈 & 교훈

### 글쓰기 타임아웃 (2026-02-27)
- **증상**: 글쓰기 페이지 이동 후 `www.naver.com`으로 리다이렉트 → write_post 타임아웃
- **원인**: `/ca-fe/cafes/{cafe_id}/articles/write` URL에 숫자 ID가 아닌 문자열 alias(`smartcredit`)가 들어감
- **Naver /ca-fe/ URL은 반드시 숫자 cafe ID만 지원** — alias 사용 시 메인페이지로 리다이렉트됨
- **수정 내용**:
  1. `navigate_to_write_page`: WebDriverWait로 페이지 로드 완전 대기 + JS 리다이렉트 감지
  2. `navigate_to_write_page`: `cafe.naver.com` 도메인 이탈 감지 시 즉시 실패 반환
  3. `write_post`: 에디터 요소 탐색 전 URL이 글쓰기 페이지인지 사전 검증
  4. `write_post`: WebDriverWait 타임아웃 15초 → 30초로 증가
- **주의**: `_resolve_numeric_cafe_id` 실패 시 alias를 그대로 반환하면 안 됨 (isdigit 체크 필수)

### 재로그인 실패 & 서버 로그 미출력 (2026-03-10)
- **증상**: 프론트엔드에 "발행 실패: 재로그인 실패" 표시, 서버 터미널에는 로그가 전혀 안 나옴
- **원인 1 (치명)**: `_is_logged_in`이 해시된 CSS 클래스(`.MyView-module__link_login___HpHMW`)에 의존
  - 네이버 프론트엔드 업데이트 시 해시 변경 → 셀렉터 못 찾음 → **미로그인을 로그인으로 오판**
  - 결과: 프로파일 세션 로그인 성공으로 통과 → 글쓰기 페이지 이동 시 세션 없어 리다이렉트 → 재로그인 실패
- **원인 2**: `login_with_credentials`에서 `document.getElementById('id').value = '...'` 후 `input` 이벤트 미발행
  - 네이버 로그인 폼(React)이 입력을 감지하지 못해 빈 값으로 로그인 시도
- **원인 3**: `logger.propagate = False` + uvicorn `reload=True`의 `dictConfig`가 핸들러 덮어씀
- **수정**:
  1. `_is_logged_in`: 다중 셀렉터(해시 무관 패턴) + 양성 확인(로그아웃 버튼) + NID 쿠키 확인
  2. `login_with_credentials`: value 설정 후 `dispatchEvent(new Event('input'))` 추가 (블로그 제너레이터와 동일)
  3. `main.py` startup: uvicorn reload 후 로거 핸들러 재설정 보장
- **교훈**: CSS 모듈 해시 클래스에 의존하지 말 것, JS value 할당 시 반드시 input 이벤트 발행

### 카페 세션 미동기화 (2026-03-13)
- **증상**: ID/PW 로그인 성공 후 바로 "세션 만료, 재로그인 중..." → 재로그인 후에도 글쓰기 페이지 이동 실패
- **원인**: `nid.naver.com` 로그인 후 `cafe.naver.com` 도메인에 세션이 즉시 동기화되지 않음
  - `_resolve_numeric_cafe_id`가 `cafe.naver.com/{alias}`를 방문하면 세션 미확립으로 실패
  - 숫자 ID 변환 실패를 "세션 만료"로 오진 → 재로그인해도 같은 문제 반복
- **수정**:
  1. `_ensure_cafe_session()` 추가: 로그인 후 `cafe.naver.com` 메인을 명시적으로 방문하여 세션 확립
  2. `publish_to_cafe`: 로그인 직후 + 재로그인 직후 모두 `_ensure_cafe_session()` 호출
  3. `_resolve_numeric_cafe_id`: 카페 방문 시 로그인 리다이렉트 조기 감지 + 방법별 실패 로그 강화
- **교훈**: nid.naver.com 로그인 ≠ cafe.naver.com 세션. 카페 조작 전 반드시 카페 도메인 세션 확립 필요

### 이미 로그인 상태에서 재로그인 → 캡차 발생 (2026-03-17)
- **증상**: 프로파일/쿠키 로그인 실패 판정 → `login_with_credentials` 호출 → 이미 로그인된 상태에서 로그인 재시도 → 캡차(이미지 인증) 발생
- **원인**: `login_with_credentials`가 `nid.naver.com/nidlogin.login` 접근 시 리다이렉트되면 "로그인 실패"로 처리. 이미 로그인 상태임에도 False 반환 → 전체 로그인 실패
- **원인 2**: 로그인 페이지가 열려도 NID 쿠키가 이미 존재하면 재로그인 불필요하나, 무조건 ID/PW 입력 → 네이버가 반복 로그인 감지하여 캡차 표시
- **수정**:
  1. `login_with_credentials`: 로그인 페이지 접근 후 리다이렉트 감지 시 이미 로그인 상태로 판단 (True 반환)
  2. `login_with_credentials`: NID 쿠키 존재 시 `_is_logged_in()` 재확인 후, 로그인 상태면 재로그인 건너뜀
- **교훈**: 이미 로그인된 상태에서 `nid.naver.com/nidlogin.login` 재접근하면 캡차 발생. 로그인 전 반드시 기존 세션 확인 필수

### 캡차 방지 강화 (2026-03-18)
- **증상**: 기존 `_is_logged_in` 체크가 www.naver.com 셀렉터 변경으로 실패 → 로그인된 상태를 미로그인으로 오판 → nidlogin 방문 → 캡차
- **수정**:
  1. `_has_nid_cookies()` 추가: **페이지 이동 없이** 브라우저 쿠키(`NID_AUT`, `NID_SES`)만 확인하는 빠른 체크
  2. `_is_logged_in`: 방법 0으로 `_has_nid_cookies` 우선 실행 — 쿠키 있으면 www.naver.com 방문 생략
  3. `_is_logged_in`: 로그인 버튼 셀렉터에 `is_displayed()` 체크 추가 — 숨겨진 요소 오탐 방지
  4. `login_with_credentials`: nidlogin 방문 전 `_has_nid_cookies` → `_is_logged_in` 2단계 체크
  5. `login_with_credentials`: nidlogin 페이지 로드 후 캡차 요소(`#captchaimg`, `img[src*='captcha']` 등) 감지 시 ID/PW 입력 중단
- **교훈**: NID 쿠키 체크는 페이지 이동이 필요 없으므로 항상 첫 번째로 수행. CSS 셀렉터 기반 로그인 판별은 네이버 프론트 업데이트에 취약하므로 쿠키 체크를 우선

### 만료 쿠키로 로그인 오판 → 카페 세션 실패 (2026-03-18)
- **증상**: 로그인이 완료되지 않았는데 카페 글쓰기 페이지로 이동, 네이버 로그인 페이지가 표시됨
- **원인 1**: `_is_logged_in` → `_has_nid_cookies` True 시 **www.naver.com 방문 없이** 바로 `return True`. 브라우저 프로파일에 만료/무효 NID 쿠키가 남아있으면 로그인된 것으로 오판
- **원인 2**: `publish_to_cafe`에서 `_ensure_cafe_session()` 반환값을 **무시**. 카페 세션 실패(로그인 리다이렉트)해도 그대로 글쓰기 페이지로 진행
- **수정**:
  1. `_is_logged_in`: NID 쿠키 없으면 즉시 False (빠른 판정), 쿠키 있으면 **반드시 www.naver.com 방문하여 실제 검증**
  2. `publish_to_cafe`: `_ensure_cafe_session()` 반환값 체크 → 실패 시 ID/PW 재로그인 → 재확립 → 그래도 실패면 에러 반환
  3. `login_with_credentials`: `_has_nid_cookies`만으로 True 반환하지 않고, `_is_logged_in` (실제 검증 포함)만 사용
- **교훈**: NID 쿠키 존재 ≠ 유효한 로그인 세션. 쿠키는 "미로그인 빠른 판정"에만 사용하고, 로그인 확인은 반드시 페이지 방문으로 검증. `_ensure_cafe_session` 반환값은 반드시 체크할 것

### _is_logged_in CSS 셀렉터 의존 제거 (2026-03-20)
- **증상**: `_is_logged_in`이 www.naver.com CSS 셀렉터(`link_login`, `link_logout` 등)로 로그인 판별 → 네이버 프론트 업데이트 시 셀렉터 매칭 실패 → "로그인 상태 판별 불가" → 미로그인으로 오판 → 불필요한 ID/PW 로그인 → 캡차 발생
- **원인**: www.naver.com의 CSS 모듈 해시 클래스에 의존하는 로그인 판별 로직이 네이버 업데이트마다 깨짐
- **참조**: `cafe-generator`(Playwright 기반)의 `check_login_status()`는 서비스 URL 접속 후 리다이렉트 여부만 확인 → CSS 셀렉터 무관하게 안정적 동작
- **수정**:
  1. `_is_logged_in`: www.naver.com + CSS 셀렉터 매칭 → **cafe.naver.com 접속 후 nidlogin 리다이렉트 여부**로 판별 (CSS 셀렉터 의존 제거)
  2. `login_with_cookie`: `_is_logged_in`이 이미 cafe.naver.com 검증하므로 중복 2차 검증 제거
  3. `login_with_credentials`: `_is_logged_in()` 사전 호출(www.naver.com 방문) → `_has_nid_cookies()` 빠른 체크 후 필요 시만 `_is_logged_in()` 호출
- **교훈**: 로그인 판별은 CSS 셀렉터가 아닌 **서비스 리다이렉트 여부**로 확인할 것. www.naver.com 불필요한 방문을 줄여 봇 탐지 위험도 감소

## Development Rules

1. 작업 중 실수가 발생하면 메모(TODO)를 업데이트하고 같은 실수를 반복하지 않는다.
2. 명령을 받으면 브라우저(서버)를 실행하고, 오류 발생 시 스스로 수정한다.

## 브랜치 관리 규칙

- **Blog Generator**와 **Cafe Macro**는 각각 별도 브랜치에서 개발한다.
- 작업 완료 후 반드시 **master에 머지**하여 두 프로젝트가 항상 공존하도록 한다.
- 사용자 로컬 PC에서는 항상 **master 브랜치**로 `run.bat`을 실행한다.
- 브랜치 전환(`git checkout`)으로 다른 프로젝트 코드가 사라지는 일이 없도록, 개발 브랜치의 변경사항은 작업 완료 즉시 master에 머지한다.
- 순서: 브랜치 작업 → 커밋 & 푸시 → master에 머지 → 사용자에게 `git pull origin master` 안내
