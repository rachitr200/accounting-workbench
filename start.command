#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -q -r backend/requirements-lock.txt
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm ci --no-audit --no-fund && npm run build)
fi
printf '\nAccounting Workbench: http://127.0.0.1:8765\nKeep this window open. Press Control-C to stop.\n\n'
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
