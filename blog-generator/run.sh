#!/usr/bin/env bash
# ============================================
#  네이버 블로그 상품 설명 자동 생성기 실행 스크립트
#  사용법: ./run.sh
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "================================================"
echo "  DailyFNI - 네이버 블로그 상품 설명 자동 생성기"
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

echo "[1/3] Python 확인: $($PYTHON --version)"

# 가상환경 생성
if [ ! -d "$VENV_DIR" ]; then
    echo "[2/3] 가상환경 생성 중..."
    $PYTHON -m venv "$VENV_DIR"
fi

# 가상환경 활성화
source "$VENV_DIR/bin/activate"

# 패키지 설치
echo "[2/3] 패키지 설치 중..."
pip install -q -r "$SCRIPT_DIR/requirements.txt"

# 서버 실행
echo "[3/3] 서버 시작 중..."
echo ""
echo "================================================"
echo "  브라우저에서 http://localhost:8000 접속하세요"
echo "  종료하려면 Ctrl+C 를 누르세요"
echo "================================================"
echo ""

cd "$BACKEND_DIR"
$PYTHON main.py
