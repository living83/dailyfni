# car-valuation

NPL 오토론 차량 시세 자동조회 파이프라인. 엑셀로 받은 채권 리스트의 각
차량(차종+연식)에 대해 엔카 / KB차차차 / 헤이딜러에서 시세를 수집해
가중평균 시장가·공매처분가를 산출한 뒤, 원본 엑셀에 컬럼을 추가해
저장한다.

상위 `dailyfni/` 레포의 다른 모듈(Node.js 기반 web/blog-generator)과는
독립적이며, 단독으로 Docker 이미지로 배포된다.

---

## 빠른 실행 (양쪽 환경 공통)

```bash
git clone https://github.com/living83/dailyfni.git
cd dailyfni/car-valuation
cp .env.example .env            # 필요 시 값을 채워서 저장
mkdir -p data logs output       # SQLite/로그/엑셀 결과 호스트 마운트 경로
docker compose up -d
curl http://localhost:8000/health
# → {"status":"ok"}
```

`docker compose down` 으로 종료. `data/`, `logs/`, `output/`는 호스트에
보존되므로 다시 `up` 해도 SQLite 캐시는 유지된다.

---

## Windows 로컬 (Docker Desktop)

### 사전 준비 (한 번만)

1. **WSL2 + Ubuntu** — 관리자 PowerShell:
   ```powershell
   wsl --install
   ```
   재부팅 후 Ubuntu 첫 실행 시 user/password 만들기 (Docker용으로는 무관).

2. **Docker Desktop** — 일반 PowerShell:
   ```powershell
   winget install Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
   ```
   설치 후 PowerShell 재시작, 시작메뉴에서 Docker Desktop 실행, 트레이
   고래 아이콘이 녹색이 될 때까지 대기.

3. **확인**:
   ```powershell
   docker --version
   docker run --rm hello-world
   ```

### 실행

```powershell
cd <repo>\car-valuation
Copy-Item .env.example .env
New-Item -ItemType Directory -Force data, logs, output | Out-Null
docker compose up -d
Invoke-WebRequest http://localhost:8000/health
```

---

## 네이버 클라우드 Ubuntu 서버

### 사전 준비 (서버에 처음 한 번)

```bash
# Docker Engine + compose 플러그인 설치
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

# 매번 sudo 안 치게 사용자 그룹 추가
sudo usermod -aG docker $USER
newgrp docker
docker run --rm hello-world
```

### 코드 + 첫 실행

```bash
git clone https://github.com/living83/dailyfni.git
cd dailyfni/car-valuation
cp .env.example .env
# 필요 시 .env 편집 (예: PROXY_HOST, FASTAPI_PORT)
mkdir -p data logs output
# 호스트-컨테이너 사용자 권한 충돌 방지 (appuser uid=999 추정)
sudo chown -R 999:999 data logs output

docker compose up -d --build
docker compose logs -f car-valuation
curl http://localhost:8000/health
```

서버 재부팅 시 자동 재시작 (`restart: unless-stopped`).

### 업데이트 흐름

```bash
cd dailyfni/car-valuation
git pull
docker compose up -d --build   # 변경된 레이어만 rebuild
```

---

## 환경변수

`.env.example` 의 키 모두가 선택 — 비워두면 `config.py` 의 기본값이
사용된다.

| 키 | 기본 | 비고 |
|---|---|---|
| `DB_PATH` | `data/car_prices.db` | SQLite 파일 경로. 컨테이너 내부 절대경로 또는 상대. |
| `CACHE_TTL_DAYS` | 7 | 7일 이내 캐시 hit 시 재스크래핑 skip |
| `SCRAPER_CONCURRENCY` | 3 | 사이트별 동시 차량 처리 수 |
| `SCRAPE_DELAY_MIN` / `SCRAPE_DELAY_MAX` | 3.0 / 7.0 | 매 호출 사이 랜덤 딜레이 (초) |
| `SCRAPER_MAX_RETRIES` | 3 | 차단(429/captcha) 감지 시 재시도 횟수 |
| `SCRAPER_BLOCKED_WAIT_SEC` | 300 | 차단 후 백오프 시간 |
| `FUZZY_MATCH_THRESHOLD` | 80 | 차종명 fuzzy 매칭 최소 점수 |
| `WEIGHT_ENCAR` / `WEIGHT_KBCHACHACHA` / `WEIGHT_HEYDEALER` | 0.40 / 0.35 / 0.25 | 가중평균 비중 |
| `AUCTION_DISCOUNT_RATIO` | 0.75 | 공매처분가 = 시장가 × 이 값 |
| `PROXY_ENABLED` | false | Decodo KR ISP IP 프록시 사용 여부 |
| `PROXY_HOST` / `PROXY_PORT` / `PROXY_USER` / `PROXY_PASS` |   | 프록시 자격증명 |
| `FASTAPI_PORT` | 8000 | 호스트에 노출되는 포트 (compose 매핑용) |
| `LOG_LEVEL` | INFO | uvicorn / 앱 로깅 레벨 |
| `TZ` | Asia/Seoul | 컨테이너 타임존 |

비밀값(프록시 비밀번호 등)을 담은 `.env`, `.env.server`, `.env.production`
파일은 `.gitignore` 로 제외돼 있으므로 절대 커밋되지 않는다.

---

## 디렉터리 구조

```
car-valuation/
├── app.py                       # FastAPI 엔트리포인트 (step 7에서 /valuate 추가)
├── config.py                    # .env / 환경변수 → 상수 매핑
├── normalizer.py                # 차종명 정규화 + 사이트별 코드 lookup
├── data/
│   ├── model_normalizer.json    # 차종 alias + 사이트별 코드 매핑 테이블
│   └── car_prices.db            # SQLite 캐시 (런타임에 생성, .gitignore)
├── db/
│   ├── schema.sql               # car_price_cache, unmatched_models 테이블
│   └── cache.py                 # async 캐시 모듈 (aiosqlite)
├── scrapers/
│   ├── base.py                  # BaseScraper (Playwright 컨텍스트 + stealth)
│   ├── utils.py                 # UA 풀, 랜덤 딜레이, 공통 예외
│   ├── encar_scraper.py         # api.encar.com 직접 호출
│   ├── kbchachacha_scraper.py   # makerCode+classCode + DOM 자체 연식 필터
│   └── heydealer_scraper.py     # market-api.heydealer.com
├── tests/                       # pytest (cache + normalizer 17개 케이스)
├── scripts/                     # 라이브 probe / 검증 스크립트
├── logs/                        # 런타임 로그 (호스트 마운트, .gitignore)
├── output/                      # 배치 결과 엑셀 (호스트 마운트, .gitignore)
├── Dockerfile                   # 멀티스테이지, python:3.11-slim + chromium
├── docker-compose.yml           # 서비스 + 볼륨 + healthcheck
├── .env.example                 # 환경변수 템플릿 (빈 값)
└── requirements.txt
```

---

## 개발 워크플로 (Docker 없이 로컬 Python)

`car-valuation/.venv` 의 Python 3.12 가상환경을 그대로 쓸 수 있다.

```powershell
# Windows PowerShell
cd <repo>\car-valuation
.\.venv\Scripts\Activate.ps1
python -m pytest tests/             # cache + normalizer 단위테스트
python scripts/test_encar.py        # 라이브 엔카 호출
```

```bash
# Linux/macOS
cd <repo>/car-valuation
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
pytest tests/
```

---

## 트러블슈팅

- **`docker build` 시 apt-get 패키지 못 찾음** — Ubuntu 24.04 이상에선
  `libasound2` → `libasound2t64`로 이름이 바뀜. Dockerfile 의 해당
  줄 교체.
- **Ubuntu 서버에서 `data/`, `logs/` permission denied** — 컨테이너
  내부 `appuser` 가 호스트 root 소유 디렉터리에 쓸 수 없음. 위
  "사전 준비" 의 `chown 999:999` 명령 실행.
- **컨테이너가 즉시 종료** — `docker compose logs car-valuation` 으로
  uvicorn import 에러 확인. 대개 `app.py` 또는 `config.py` 에서 새
  의존성 import 누락 (`pip install` + `docker compose up --build`).
- **차단/캡차 빈발** — `.env` 의 `SCRAPE_DELAY_MAX` 늘리고
  `SCRAPER_CONCURRENCY` 낮춤. 프록시 사용 시 `PROXY_ENABLED=true` +
  Decodo 자격증명 채움.
