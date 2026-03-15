#!/bin/bash
# Launch Sloth Space with a local dev server
# Usage: ./serve.sh [port]

PORT=${1:-8000}
echo "🦥 Starting Sloth Space on http://localhost:$PORT/index_new.html"
echo "   Press Ctrl+C to stop"
echo ""

# Try npx serve first, fall back to python
if command -v npx &>/dev/null; then
  npx serve . -l $PORT --no-clipboard
elif command -v python3 &>/dev/null; then
  python3 -m http.server $PORT
elif command -v python &>/dev/null; then
  python -m http.server $PORT
else
  echo "Error: Need npx (Node.js) or python3 to run a server"
  exit 1
fi
