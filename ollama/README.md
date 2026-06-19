# Ollama dev tooling

Shared scripts and endpoint tests for the Visibabel extension and GLM-OCR service. This folder is dev tooling, not a product module.

## What it tests

- Endpoint health (`/api/tags`)
- Optional OCR generation (`/api/generate`) using a tiny image payload
- Negative cases (malformed requests, missing model, timeout)

## Start Ollama

Windows (PowerShell):

```powershell
npm --prefix ./ollama run start:ollama
```

Linux/macOS:

```bash
chmod +x ./ollama/start-ollama.sh
./ollama/start-ollama.sh
```

Both set `OLLAMA_HOST=0.0.0.0:11434` and `OLLAMA_ORIGINS=*` then run `ollama serve` in the foreground.

Pull the model first:

```bash
ollama pull glm-ocr:latest
```

Verify the endpoint:

```powershell
curl.exe -fsS http://localhost:11434/api/tags
```

## Run tests

From repository root:

```powershell
npm --prefix ./ollama run test
```

Endpoint-only:

```powershell
npm --prefix ./ollama run test:integration
npm --prefix ./ollama run test:negative
```

Integration tests require a running Ollama instance with `glm-ocr:latest` available.

## Environment variables

- `OLLAMA_ENDPOINT` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `glm-ocr`)
- `OLLAMA_TIMEOUT_MS` (default: `60000`)
- `RUN_GENERATE_TEST` (`1` to force `/api/generate` test)
