#!/usr/bin/env bash
set -e

echo "========================================"
echo "  DailyFNI Cafe Macro - 코드 업데이트"
echo "========================================"
echo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_FILE="$SCRIPT_DIR/data/cafe_macro.db"
BACKUP_DIR="$SCRIPT_DIR/data/backup"
BRANCH="claude/naver-cafe-macro-setup-eOklp"

# ── 1) DB 백업 ──
if [ -f "$DB_FILE" ]; then
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/cafe_macro_${TIMESTAMP}.db"
    cp "$DB_FILE" "$BACKUP_FILE"
    echo "[1/3] DB 백업 완료: $BACKUP_FILE"
else
    echo "[1/3] DB 파일 없음 (백업 스킵)"
fi

# ── 2) 최신 코드 받기 ──
echo "[2/3] 최신 코드 업데이트 중..."
cd "$ROOT_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git pull origin "$BRANCH"
echo "      코드 업데이트 완료"

# ── 3) DB 확인 ──
if [ -f "$DB_FILE" ]; then
    echo "[3/3] DB 파일 정상 (삭제되지 않음)"
else
    # DB가 사라진 경우 최신 백업에서 복원
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/cafe_macro_*.db 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        mkdir -p "$SCRIPT_DIR/data"
        cp "$LATEST_BACKUP" "$DB_FILE"
        echo "[3/3] DB 복원 완료: $LATEST_BACKUP"
    else
        echo "[3/3] 백업 없음 - 서버 시작 시 새 DB가 생성됩니다"
    fi
fi

echo
echo "========================================"
echo "  업데이트 완료! ./run.sh 로 서버를 시작하세요"
echo "========================================"
