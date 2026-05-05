#!/bin/bash
set -e

echo "========================================"
echo "  DailyFNI 카페 매크로 서버 배포"
echo "========================================"

DEPLOY_DIR="/opt/dailyfni-cafe"
REPO_URL="https://github.com/living83/dailyfni.git"
BRANCH="claude/upload-cafe-macro-XmoAU"
SUBFOLDER="naver-cafe-auto"

# 1. 소스 클론 또는 업데이트
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "[1/5] 기존 소스 업데이트..."
    cd "$DEPLOY_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
else
    echo "[1/5] 소스 클론..."
    TMP_DIR=$(mktemp -d)
    git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$TMP_DIR"

    # naver-cafe-auto 하위 폴더만 배포 디렉토리로 복사
    mkdir -p "$DEPLOY_DIR"
    cp -r "$TMP_DIR/$SUBFOLDER/"* "$DEPLOY_DIR/"
    cp -r "$TMP_DIR/$SUBFOLDER/".* "$DEPLOY_DIR/" 2>/dev/null || true

    # git 히스토리 유지 (업데이트용)
    mv "$TMP_DIR/.git" "$DEPLOY_DIR/.git"
    rm -rf "$TMP_DIR"

    # sparse checkout 설정 (다음 pull부터 subfolder만)
    cd "$DEPLOY_DIR"
    git config core.sparseCheckout true
    echo "$SUBFOLDER/*" > .git/info/sparse-checkout
fi

# 2. Python venv 생성 및 패키지 설치
echo "[2/5] Python 가상환경 설정..."
if [ ! -d "$DEPLOY_DIR/venv" ]; then
    python3 -m venv "$DEPLOY_DIR/venv"
fi
"$DEPLOY_DIR/venv/bin/pip" install --upgrade pip -q
"$DEPLOY_DIR/venv/bin/pip" install -r "$DEPLOY_DIR/requirements.txt" -q

# 3. Playwright Chromium 설치
echo "[3/5] Playwright Chromium 설치..."
"$DEPLOY_DIR/venv/bin/playwright" install chromium
"$DEPLOY_DIR/venv/bin/playwright" install-deps chromium 2>/dev/null || true

# 4. 필요 디렉토리 생성
echo "[4/5] 디렉토리 생성..."
mkdir -p "$DEPLOY_DIR/data/cookies"
mkdir -p "$DEPLOY_DIR/data/debug_screenshots"
mkdir -p "$DEPLOY_DIR/logs"
mkdir -p "$DEPLOY_DIR/config"

# .env 파일이 없으면 샘플 생성
if [ ! -f "$DEPLOY_DIR/config/.env" ]; then
    cat > "$DEPLOY_DIR/config/.env" << 'ENVEOF'
MASTER_KEY=change-me-in-production
PROXY_SERVER=
PROXY_USERNAME=
PROXY_PASSWORD=
ENVEOF
    echo "  → config/.env 샘플 생성됨 (MASTER_KEY 변경 필요!)"
fi

# 5. PM2 시작
echo "[5/5] PM2 프로세스 시작..."
cd "$DEPLOY_DIR"

# 기존 프로세스 중지 (있으면)
pm2 stop cafe-macro-python 2>/dev/null || true
pm2 delete cafe-macro-python 2>/dev/null || true

pm2 start ecosystem.config.js
pm2 save

echo ""
echo "========================================"
echo "  배포 완료!"
echo "  카페 매크로: http://$(hostname -I | awk '{print $1}'):8002"
echo "  PM2 상태: pm2 status"
echo "  로그 확인: pm2 logs cafe-macro-python"
echo "========================================"
