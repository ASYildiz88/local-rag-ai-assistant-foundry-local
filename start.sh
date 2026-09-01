#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
echo "Local AI - Final Submission 1.0"
echo "Open http://127.0.0.1:8501 in your browser."
exec python3 app.py
