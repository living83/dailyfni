#!/bin/bash
echo "========================================"
echo "  DailyFNI Blog Generator Server"
echo "========================================"
echo ""

DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v python3 &>/dev/null; then
    echo "[ERROR] Python3 not found."
    exit 1
fi

echo "Using: $(python3 --version)"
echo ""

if [ ! -d "$DIR/.venv" ]; then
    echo "[0/2] Creating virtual environment..."
    python3 -m venv "$DIR/.venv"
fi

echo "[1/2] Installing packages..."
"$DIR/.venv/bin/pip" install -r "$DIR/requirements.txt" -q

echo "[2/2] Starting server..."
echo ""
echo "  Open http://localhost:8000"
echo "  Press Ctrl+C to stop"
echo ""
echo "========================================"

cd "$DIR/backend"
"$DIR/.venv/bin/python" main.py
