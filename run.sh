#!/bin/bash
echo "========================================"
echo "  DailyFNI - All Services Launcher"
echo "========================================"
echo ""
echo "  [1] Blog Generator  : http://localhost:8000"
echo "  [2] Cafe Macro       : http://localhost:8001"
echo ""
echo "========================================"
echo ""

DIR="$(cd "$(dirname "$0")" && pwd)"

"$DIR/blog-generator/run.sh" &
PID_BLOG=$!

"$DIR/naver-cafe-macro/run.sh" &
PID_CAFE=$!

echo "  Blog Generator PID: $PID_BLOG"
echo "  Cafe Macro PID:     $PID_CAFE"
echo ""
echo "  Press Ctrl+C to stop all servers."
echo ""

trap "kill $PID_BLOG $PID_CAFE 2>/dev/null; exit" INT TERM
wait
