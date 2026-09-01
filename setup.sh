#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
echo "Local AI - one-time setup"
echo "Internet access may be required to install packages and cache models."
python3 -m pip install -r requirements.txt
python3 setup_models.py
