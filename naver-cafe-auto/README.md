# Naver Cafe Auto (네이버 카페 매크로 프로젝트)

## 📌 프로젝트 개요
네이버 카페에 주기적으로 포스팅과 댓글을 자동 작성하기 위한 자동화 매크로 시스템입니다. 
다수 계정 및 카페를 매핑하여 효율적으로 트래픽과 활동성을 관리하는 역할을 수행하며, 최신 인공지능(Claude API)을 연동하여 자연스럽고 문맥에 맞는 양질의 텍스트(게시글, 댓글)를 생성 및 배포합니다.

## 🚀 주요 기능 목록
- **다중 계정 및 카페 관리**: DB 내에 여러 네이버 계정 및 타겟 카페 그룹을 매핑하여 교차 배포 지원.
- **자동 AI 원고 생성**: Claude 3.5 API 기반으로 제시된 키워드와 톤(공감, 후기 등)에 맞는 원고 작성.
- **스케줄러 기반 배치 발행**: APScheduler를 사용해 정해진 요일, 시간에 맞춰 다중 스레드로 병렬 포스팅 진행 (저품질 방지 딜레이 포함).
- **최신 뷰 환경 대응 (신형 에디터 SPA 지원)**: Playwright를 사용, 네이버 스마트에디터(신형/구형) 및 iFrame을 자동 탐색하고 리다이렉트를 감지.
- **스텔스 기능 지원 (IP 분산)**: 계정별로 매핑된 프록시 연결 및 스텔스 브라우저 프로필 생성을 통해 계정 블라인드 리스크 완화.

## 🛠 실행 방법 / 의존성
### 요구 사항
- Python 3.10+
- Chrome 브라우저
- Playwright 구동 환경

### 설치 및 초기화
```bash
# 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt
playwright install
```

### 실행 방법
```bash
# FastAPI 서버 및 스케줄러 구동
python backend/main.py
```
*(기본적으로 `http://localhost:8001`에서 서버와 스케줄러가 데몬으로 실행됩니다.)*

## 📁 파일 구조 설명
- **backend/main.py**: FastAPI 진입점 및 의존성, 스케줄러 자동 실행 로직을 담음.
- **backend/scheduler.py**: APScheduler를 초기화하고 잡(배치 스케줄링) 및 교차 발행 알고리즘, 저품질 방지 로직 담당.
- **backend/cafe_publisher.py**: 텍스트 매칭 기반의 콤보박스 선택, 브라우저 마우스/키보드 자동 이벤트, 리다이렉트 추적 등 실제 브라우저 포스팅 제어 수행.
- **backend/se_helpers.py**: 스텔스 프로필 생성 및 쿠키 기반 네이버 자동 로그인(및 우회) 공통 패턴.
- **backend/content_generator.py**: 프롬프트 생성 후 Anthropic(Claude API)를 호출하는 인공지능 로직.
- **backend/database.py**: SQLite를 통해 포스팅 내역(history), 계정, 카페 설정 등을 로컬 관리.

---
*(이 리드미는 자동 생성되었습니다.)*
