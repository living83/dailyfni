#!/usr/bin/env bash
set -e

echo "========================================"
echo "  DailyFNI - All Services Launcher"
echo "========================================"
echo
echo "  [1] Blog Generator  : http://localhost:8000"
echo "  [2] Cafe Macro       : http://localhost:8001"
echo
echo "========================================"
echo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find Python
PYTHON=""
for cmd in python3.12 python3.13 python3; do
    if command -v "$cmd" &>/dev/null; then
        PYTHON="$cmd"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "[ERROR] Python not found. Install Python 3.12+"
    exit 1
fi

echo "Using: $PYTHON"
$PYTHON --version
echo

# ---- Blog Generator Setup ----
BLOG_DIR="$SCRIPT_DIR/blog-generator"
if [ ! -d "$BLOG_DIR/.venv" ]; then
    echo "[1/4] Blog Generator - creating venv..."
    $PYTHON -m venv "$BLOG_DIR/.venv"
else
    echo "[1/4] Blog Generator - venv ready"
fi

echo "[2/4] Blog Generator - installing packages..."
"$BLOG_DIR/.venv/bin/pip" install -r "$BLOG_DIR/requirements.txt" -q

# ---- Cafe Macro Setup ----
CAFE_DIR="$SCRIPT_DIR/naver-cafe-macro"
if [ ! -d "$CAFE_DIR/.venv" ]; then
    echo "[3/4] Cafe Macro - creating venv..."
    $PYTHON -m venv "$CAFE_DIR/.venv"
else
    echo "[3/4] Cafe Macro - venv ready"
fi

echo "[4/4] Cafe Macro - installing packages..."
"$CAFE_DIR/.venv/bin/pip" install -r "$CAFE_DIR/requirements.txt" -q

echo
echo "========================================"
echo "  Starting both servers..."
echo "========================================"
echo

# Cleanup function to kill both servers on exit
cleanup() {
    echo
    echo "Shutting down servers..."
    kill $BLOG_PID $CAFE_PID 2>/dev/null
    wait $BLOG_PID $CAFE_PID 2>/dev/null
    echo "Done."
}
trap cleanup EXIT INT TERM

# Start Blog Generator in background
cd "$BLOG_DIR/backend"
"$BLOG_DIR/.venv/bin/python" main.py &
BLOG_PID=$!

# Start Cafe Macro in background
cd "$CAFE_DIR/backend"
"$CAFE_DIR/.venv/bin/python" main.py &
CAFE_PID=$!

echo "  Blog Generator  : http://localhost:8000  (PID: $BLOG_PID)"
echo "  Cafe Macro       : http://localhost:8001  (PID: $CAFE_PID)"
echo
echo "  Press Ctrl+C to stop both servers."
echo

# Wait for both processes
wait
