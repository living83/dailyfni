# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DailyFNI는 네이버 블로그 자동 포스팅을 위한 멀티 에이전트 AI 시스템이다. 두 개의 독립적 컴포넌트로 구성:

- **Node.js Agency Framework** (`/src`) - 범용 멀티 에이전트 오케스트레이션 REST API (Express.js, port 3000)
- **Python Blog Generator** (`/blog-generator`) - 네이버 블로그 자동 생성/발행 시스템 (FastAPI, port 8000)

## Commands

### Node.js (Agency Framework)
```bash
npm install          # 의존성 설치
npm start            # 프로덕션 서버 (port 3000)
npm run dev          # 개발 모드 (파일 감시)
npm run demo         # 데모 실행 (src/demo.js)
```

### Python (Blog Generator)
```bash
# Linux/macOS
./blog-generator/run.sh

# Windows
./blog-generator/run.bat

# 수동 실행
cd blog-generator/backend && python main.py
```

### Environment Setup
```bash
cp .env.example .env
cp blog-generator/.env.example blog-generator/.env
# 두 .env 파일에 API 키, DB 설정 입력
```

데이터베이스 테이블은 `database.py`의 `init_db()`가 최초 실행 시 자동 생성한다.

## Architecture

### Blog Generator Processing Pipeline

1. **키워드 입력** → 스케줄러 큐 등록
2. **기사 생성** (발행 2시간 전) → Claude API로 3가지 톤(친근/전문/초보) 병렬 생성 → MySQL에 draft 저장
3. **발행** (예약 시간) → Playwright로 네이버 블로그 자동 로그인/작성/발행 → status를 published로 갱신

### Key Backend Modules (Python)

| 파일 | 역할 |
|------|------|
| `main.py` | FastAPI 앱, SSE 엔드포인트, Pydantic 모델 |
| `agents.py` | Claude API 호출 유틸리티 |
| `prompts.py` | 톤별 프롬프트 템플릿 (Research, SEO, Writer×3, Reviewer) |
| `database.py` | aiomysql 비동기 커넥션 풀, CRUD, `.env` 파싱 |
| `scheduler.py` | APScheduler AsyncIOScheduler 잡 관리 |
| `blog_publisher.py` | Playwright 기반 네이버 블로그 자동화 |
| `image_generator.py` | Pillow 기반 썸네일 이미지 생성 |
| `se_helpers.py` | 네이버 검색 순위 추적 |
| `crypto.py` | AES-256 계정 암호화 (MASTER_KEY 사용) |

### Node.js Agent Framework (`/src`)

- `core/` - Agent, Agency, Task, Tool, Planner 기반 클래스
- `agents/` - Research, Writer, SEO, Image, Reviewer, Publisher 전문 에이전트
- `tools/` - 21개 특화 도구 (ContentTemplate, AffiliateLink, NaverBlogPublish 등)
- `routes/` - REST API (auth, agency, writer, research, seo, image, reviewer, publisher, planner)
- `middleware/` - JWT 인증, 에러 핸들링

Agency 실행: Agent 생성 → Task 정의 → Agency에 등록 → `Agency.run()` (sequential/parallel 전략)

### Frontend

`blog-generator/frontend/index.html` - 프레임워크 없는 vanilla JS SPA (54KB 단일 파일). REST API + SSE로 백엔드 통신.

### Database

MySQL 8.0+, aiomysql 비동기 풀. 주요 테이블: `accounts`, `categories`, `keywords`, `articles`, `batches`, `publish_history`, `scheduler_config`, `notifications`. 네이버 계정 정보는 AES-256 암호화 저장.

## Critical Configuration

- `ANTHROPIC_API_KEY` - Claude API 키 (필수)
- `MASTER_KEY` - AES-256 암호화 키 (32자 이상, 계정 암호화용)
- `MYSQL_*` - MySQL 연결 정보 (host, port, user, password, db)
- `ALLOWED_ORIGINS` - CORS 허용 도메인 (쉼표 구분)
- AI 모델: `claude-sonnet-4-5-20250929`

## Known Issues & Notes

- `database.py`의 `_load_env_file()`이 `.env`를 직접 파싱한다 (Windows에서 `load_dotenv` 미동작 문제 해결용). `.env` 값에서 따옴표를 자동 strip한다.
- MySQL 8.0의 `caching_sha2_password` 인증에는 `cryptography` 패키지 필요. 없으면 `mysql_native_password`로 폴백 시도.
- `ProductCrawlerTool.js`의 크롤러는 현재 시뮬레이션 상태 (cheerio+axios 연동 준비됨).
- 품질 관리: 연속 발행일 제한, 강제 휴식, 계정 로테이션, 이미지 3종 변형, 랜덤 스케줄링.

## Development Rules

1. 작업 중 실수가 발생하면 메모(TODO)를 업데이트하고 같은 실수를 반복하지 않는다.
2. 명령을 받으면 브라우저(서버)를 실행하고, 오류 발생 시 스스로 수정한다.
