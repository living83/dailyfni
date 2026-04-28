#!/bin/bash
set -e

APP_DIR="/opt/dailyfni-blog"
REPO="https://github.com/living83/dailyfni.git"
BRANCH="claude/learn-naver-blog-auto-0mVWv"

echo "=== DailyFNI Blog 서버 배포 ==="

# 1. 클론
if [ -d "$APP_DIR" ]; then
  echo "[1/7] 기존 폴더 존재 — git pull"
  cd "$APP_DIR"
  git pull origin "$BRANCH"
else
  echo "[1/7] 클론: $REPO"
  git clone -b "$BRANCH" "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# 2. Node.js 의존성
echo "[2/7] Node.js 패키지 설치"
npm install --production

# 3. Python 가상환경 + 패키지
echo "[3/7] Python 환경 설정"
cd "$APP_DIR/blog-generator"
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# 4. Playwright 브라우저
echo "[4/7] Playwright Chromium 설치"
playwright install chromium
playwright install-deps chromium 2>/dev/null || true
deactivate

# 5. .env 파일
cd "$APP_DIR"
if [ ! -f ".env" ]; then
  echo "[5/7] .env 파일 생성 (수정 필요)"
  cat > .env << 'ENVEOF'
PORT=3001
PYTHON_API_URL=http://localhost:8001
HEADLESS=true

# 텔레그램 알림
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# AI 키
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
ENVEOF
  echo "  ⚠️  .env 파일을 열어서 텔레그램/API 키를 입력하세요"
else
  echo "[5/7] .env 이미 존재 — 건너뜀"
fi

# 6. data 폴더 생성
echo "[6/7] 데이터 폴더 생성"
mkdir -p "$APP_DIR/data"

# 7. PM2 등록 + 시작
echo "[7/7] PM2 시작"
cd "$APP_DIR"
pm2 delete blog-macro blog-macro-python 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "=== 배포 완료 ==="
echo "  Node.js:  http://localhost:3001  (PM2: blog-macro)"
echo "  Python:   http://localhost:8001  (PM2: blog-macro-python)"
echo "  프론트:   별도 빌드 필요 (cd frontend && npm run build)"
echo ""
echo "  로그: pm2 logs blog-macro"
echo "  상태: pm2 status"
echo ""
echo "  ⚠️ .env 파일에 텔레그램/API 키를 설정하세요:"
echo "     nano $APP_DIR/.env"
