#!/usr/bin/env bash
set -e

echo "========================================"
echo "  DailyFNI Cafe Macro Server"
echo "========================================"
echo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

# Find Python 3.12 or 3.13, fallback to python3
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

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "[0/2] Creating virtual environment..."
    $PYTHON -m venv "$VENV_DIR"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

echo "[1/2] Installing packages..."
pip install -r "$SCRIPT_DIR/requirements.txt" -q

echo "[2/2] Starting server..."
echo
echo "  Open http://localhost:8001"
echo "  Press Ctrl+C to stop"
echo
echo "========================================"

cd "$SCRIPT_DIR/backend"
python main.py
