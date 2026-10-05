#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:4b}"
if ! curl -fsS --max-time 3 http://127.0.0.1:11434/api/tags >/dev/null; then
  printf 'Start Ollama locally and install the model first: ollama pull %s\n' "$OLLAMA_MODEL"
  exit 1
fi
if [ ! -d .venv ]; then
  if command -v uv >/dev/null 2>&1; then uv venv --python 3.12 .venv; else python3 -m venv .venv; fi
fi
if ! .venv/bin/python -c "import sys; assert sys.version_info >= (3,10)"; then
  printf "Python 3.10 or newer is required. Create a Python 3.12 virtual environment before starting.\n"
  exit 1
fi
.venv/bin/python -m pip install -q -r backend/requirements-lock.txt
printf '\nAI workbench: http://127.0.0.1:8766\nModel: %s\n' "$OLLAMA_MODEL"
exec .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8766
