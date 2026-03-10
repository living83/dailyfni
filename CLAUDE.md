# 프로젝트 메모

## 실행 방법
- **둘 다 동시 실행**: 루트의 `run.bat` 실행 → Blog(8000) + Cafe(8001) 동시 시작
- **개별 실행**: `blog-generator/run.bat` 또는 `naver-cafe-macro/run.bat`
- `python backend/main.py` 직접 실행 X → 반드시 `run.bat` 사용
- `run.bat`이 venv 생성, 패키지 설치, 서버 실행을 자동 처리

## 서버 포트
- Blog Generator: http://localhost:8000
- Cafe Macro: http://localhost:8001

## 안내 시 주의
- 사용자에게 실행 안내할 때: `git pull` 후 루트 `run.bat` 실행

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

## Development Rules

1. 작업 중 실수가 발생하면 메모(TODO)를 업데이트하고 같은 실수를 반복하지 않는다.
2. 명령을 받으면 브라우저(서버)를 실행하고, 오류 발생 시 스스로 수정한다.

## 브랜치 관리 규칙

- **Blog Generator**와 **Cafe Macro**는 각각 별도 브랜치에서 개발한다.
- 작업 완료 후 반드시 **master에 머지**하여 두 프로젝트가 항상 공존하도록 한다.
- 사용자 로컬 PC에서는 항상 **master 브랜치**로 `run.bat`을 실행한다.
- 브랜치 전환(`git checkout`)으로 다른 프로젝트 코드가 사라지는 일이 없도록, 개발 브랜치의 변경사항은 작업 완료 즉시 master에 머지한다.
- 순서: 브랜치 작업 → 커밋 & 푸시 → master에 머지 → 사용자에게 `git pull origin master` 안내
