#!/usr/bin/env bash
set -euo pipefail

export OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0:11434}"
export OLLAMA_ORIGINS="${OLLAMA_ORIGINS:-*}"

echo "[visibabel] Starting Ollama"
echo "[visibabel] OLLAMA_HOST=${OLLAMA_HOST}"
echo "[visibabel] OLLAMA_ORIGINS=${OLLAMA_ORIGINS}"

exec ollama serve
