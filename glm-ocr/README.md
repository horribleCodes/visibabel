# GLM-OCR Local Service (glmocr + Ollama)

This setup follows the official GLM-OCR Ollama deployment guidance and adds a small local API service used by the extension to augment OCR with layout data. This server doesn't handle any OCR inference, it only provides layout-aware augmentation for Ollama.

Reference:
[https://github.com/zai-org/GLM-OCR/blob/main/examples/ollama-deploy/README.md](https://github.com/zai-org/GLM-OCR/blob/main/examples/ollama-deploy/README.md)

## 1) Install prerequisites

### Ollama

- Install Ollama from [https://ollama.ai/download](https://ollama.ai/download)
- Verify:

```bash
ollama --version
```

### GLM-OCR SDK + local service runtime

#### Linux/macOS

```bash
cd glm-ocr
python -m venv .venv
.venv/bin/pip install -r requirements.txt
```

#### Windows

```powershell
cd glm-ocr
.venv\Scripts\pip install -r requirements.txt
```

## 2) Pull model and start Ollama

```bash
ollama pull glm-ocr:latest
ollama serve
```

Default endpoint: `http://localhost:11434`

## 3) SDK config

`config.yaml` is preconfigured for Ollama native generate mode (`ollama_generate`):

- `api_path: /api/generate`
- `model: glm-ocr:latest`
- `api_mode: ollama_generate`

## 4) Start local layout augmentation service

Windows PowerShell:

```powershell
cd glm-ocr
./run-service.ps1
```

Linux/macOS:

```bash
cd glm-ocr
chmod +x run-service.sh
./run-service.sh
```

Service endpoint: `http://localhost:5002/layout/augment`

Health endpoint: `http://localhost:5002/health`

The service binds on `0.0.0.0:5002` so it is reachable via localhost and host-network IPs.

### Model session cache and idle eviction

The local service keeps GLM-OCR parser sessions cached per Ollama target and model so repeated requests can reuse an already initialized runtime.

Cache key dimensions:

- Ollama host
- Ollama port
- model name
- request timeout value

Idle eviction defaults to 15 minutes. You can override it with environment variables:

- `GLMOCR_MODEL_IDLE_TIMEOUT_SECONDS` (highest priority)
- `GLMOCR_MODEL_IDLE_TIMEOUT_MINUTES` (fallback convenience option)

If both are unset, the default is `900` seconds.

### Layout model download behavior

The service resolves `pipeline.layout.model_dir` with a local-first strategy so Hugging Face downloads are not repeated on every run.

- If `GLMOCR_LAYOUT_MODEL_DIR` is set, that path is used first.
- If the configured layout model is a Hugging Face repo ID (for example `PaddlePaddle/PP-DocLayoutV3_safetensors`), the service stores it under `glm-ocr/models/layout/<repo-id-with-slashes-replaced>`.
- If the local cache directory already contains files, it is reused immediately.
- Download happens only when that local cache directory is missing or empty.

### Health payload fields

`/health` now returns cache visibility fields in addition to status:

- `idle_timeout_seconds`: effective idle timeout after env resolution
- `cache_size`: active cached session count
- `loaded_models`: active cached session metadata list

Each `loaded_models` entry includes:

- `model`
- `host`
- `port`
- `timeout_ms`
- `idle_seconds`
- `age_seconds`

If stale parser sessions need to be force-cleared immediately, restart the local service.

## 5) Verify Ollama API quickly

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "glm-ocr:latest",
  "prompt": "Hello",
  "stream": false
}'
```

## 6) Run GLM-OCR CLI

```bash
glmocr parse <path-to-image> --config config.yaml
```

## 7) Run Python tests

### Windows

```powershell
glm-ocr\.venv\Scripts\pytest
```

### Linux/macOS:

```bash
glm-ocr/.venv/bin/pytest
```

## Notes

- This setup mirrors the official recommendation to prefer Ollama native `/api/generate` for vision stability.
- The extension auto-derives the layout service URL from the configured Ollama endpoint host and port `5002`.
- For better production throughput/latency, the official docs still suggest vLLM or SGLang. To be implemented.
