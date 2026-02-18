#!/usr/bin/env bash
# ============================================
#  DailyFNI - 네이버 블로그 자동 발행 시스템
#  사용법: ./run.sh
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/.venv"
DATA_DIR="$SCRIPT_DIR/data"

echo "================================================"
echo "  DailyFNI - 네이버 블로그 자동 발행 시스템"
echo "================================================"
echo ""

# Python 확인
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "[오류] Python이 설치되어 있지 않습니다."
    echo "  https://www.python.org/downloads/ 에서 Python 3.9 이상을 설치해주세요."
    exit 1
fi

echo "[1/5] Python 확인: $($PYTHON --version)"

# 가상환경 생성
if [ ! -d "$VENV_DIR" ]; then
    echo "[2/5] 가상환경 생성 중..."
    $PYTHON -m venv "$VENV_DIR"
fi

# 가상환경 활성화
source "$VENV_DIR/bin/activate"

# 패키지 설치
echo "[3/5] 패키지 설치 중..."
pip install -q -r "$SCRIPT_DIR/requirements.txt"

# Playwright 브라우저 설치 (최초 1회)
if [ ! -d "$HOME/.cache/ms-playwright" ] && [ ! -d "$VENV_DIR/lib/python*/site-packages/playwright/driver/package/.local-browsers" ]; then
    echo "[4/5] Playwright 브라우저 설치 중... (최초 1회, 시간이 걸릴 수 있습니다)"
    playwright install chromium
else
    echo "[4/5] Playwright 브라우저 확인 완료"
fi

# .env 파일 확인
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo ""
    echo "[경고] .env 파일이 없습니다!"
    echo "  .env.example을 복사하여 .env를 생성하고 설정하세요:"
    echo "  cp .env.example .env"
    echo "  vim .env  # ANTHROPIC_API_KEY, MASTER_KEY 설정"
    echo ""
fi

# 데이터 디렉토리 생성
mkdir -p "$DATA_DIR/cookies" "$DATA_DIR/logs"

# 서버 실행
echo "[5/5] 서버 시작 중..."
echo ""
echo "================================================"
echo "  브라우저에서 http://localhost:8000 접속하세요"
echo "  종료하려면 Ctrl+C 를 누르세요"
echo "================================================"
echo ""
echo "주요 기능:"
echo "  - 글 생성: 상품/키워드 기반 자동 글 생성"
echo "  - 계정 관리: 네이버 계정 AES-256 암호화 저장"
echo "  - 자동 발행: Playwright로 네이버 블로그 자동 발행"
echo "  - 스케줄러: 매일 자동 발행 (저품질 방지 패턴)"
echo "  - 키워드 큐: 키워드 대기열 관리"
echo "  - 통계: 발행 이력/통계 대시보드"
echo ""

cd "$BACKEND_DIR"
$PYTHON main.py
