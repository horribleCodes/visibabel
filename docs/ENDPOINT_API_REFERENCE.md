# Visibabel Endpoint API Reference

This document describes the HTTP endpoints currently used by Visibabel components.

- Extension client -> Ollama API
- Extension client -> GLM-OCR local service
- GLM-OCR local service -> Ollama API

## Base URLs

- Ollama default base URL: `http://localhost:11434/`
- GLM-OCR local service default base URL: `http://localhost:5002/`

---

## Ollama Endpoints

### GET /api/tags

Used for endpoint reachability checks and available-model listing.

#### Request

- Method: `GET`
- Path: `/api/tags`
- Body: none

#### Success response

- Status: `200 OK`
- Typical body shape:

```json
{
  "models": [
    {
      "name": "glm-ocr:latest"
    }
  ]
}
```

Notes:

- Tests accept either `models` or `tags` as an array.

#### Error response

- Endpoint unavailable: network failure or timeout from caller side.
- Non-200 status is treated as offline/unhealthy by extension health checks.

---

### OPTIONS /api/tags

Used in integration tests to validate CORS preflight behavior.

#### Request

- Method: `OPTIONS`
- Path: `/api/tags`
- Example headers:

```http
Origin: http://localhost
Access-Control-Request-Method: GET
```

#### Success response

- Status: `204 No Content` (expected in tests)
- Includes CORS headers such as `access-control-allow-origin`

---

### GET /api/ps

Used to inspect currently loaded Ollama model sessions.

#### Request

- Method: `GET`
- Path: `/api/ps`
- Body: none

#### Success response

- Status: `200 OK`
- Typical body shape:

```json
{
  "models": [
    {
      "name": "glm-ocr:latest"
    }
  ]
}
```

#### Error response

- Non-200 or fetch error is tolerated by model-state listing; extension falls back to empty loaded model list.

---

### POST /api/chat

Used by OCR and translation steps when mode is `chat` or `chat_fallback`.

#### Request

- Method: `POST`
- Path: `/api/chat`
- Headers: `Content-Type: application/json`

OCR request example (glm-ocr uses task prompt only; no system message):

```json
{
  "model": "glm-ocr:latest",
  "stream": false,
  "options": {
    "temperature": 0,
    "top_k": 1,
    "top_p": 0.00001,
    "repeat_penalty": 1.1,
    "num_predict": 8192,
    "stop": ["<|endoftext|>", "<|user|>"]
  },
  "messages": [
    {
      "role": "user",
      "content": "Text Recognition:",
      "images": ["<base64-image>"]
    }
  ]
}
```

Translation request example:

```json
{
  "model": "kaelri/hy-mt2:1.8b",
  "stream": false,
  "options": { "temperature": 0 },
  "messages": [
    {
      "role": "user",
      "content": "<translation prompt with OCR text>"
    }
  ]
}
```

#### Success response

- Status: `200 OK`
- Expected body fields used by extension:

```json
{
  "message": {
    "content": "<generated text>"
  }
}
```

#### Error response

- Non-200 leads to retry/fallback logic.
- In `chat_fallback` mode, extension falls back to `POST /api/generate`.

---

### POST /api/generate

Used for OCR/translation fallback and explicit completion mode, and for model load/unload keep-alive control.

#### Request

- Method: `POST`
- Path: `/api/generate`
- Headers: `Content-Type: application/json`

OCR request example (default completion mode):

```json
{
  "model": "glm-ocr:latest",
  "prompt": "Text Recognition:",
  "images": ["<base64-image>"],
  "stream": false,
  "options": {
    "temperature": 0,
    "top_k": 1,
    "top_p": 0.00001,
    "repeat_penalty": 1.1,
    "num_predict": 8192,
    "stop": ["<|endoftext|>", "<|user|>"]
  }
}
```

Model lifecycle request example:

```json
{
  "model": "glm-ocr:latest",
  "prompt": "",
  "stream": false,
  "keep_alive": "30m"
}
```

Unload request uses:

```json
{
  "model": "glm-ocr:latest",
  "prompt": "",
  "stream": false,
  "keep_alive": 0
}
```

#### Success response

- Status: `200 OK`
- Expected body field used by extension:

```json
{
  "response": "<generated text>"
}
```

#### Error response

- Typical error shape in tests:

```json
{
  "error": "<error message>"
}
```

- Missing model or malformed JSON is expected to return non-200.

---

## GLM-OCR Local Service Endpoints

### GET /health

Used by extension to verify layout service availability and list cached parser sessions.

#### Request

- Method: `GET`
- Path: `/health`
- Body: none

#### Success response (`status = ok`)

- Status: `200 OK`

```json
{
  "status": "ok",
  "idle_timeout_seconds": 900,
  "cache_size": 1,
  "loaded_models": [
    {
      "cache_key": "localhost:11434|glm-ocr:latest|60000",
      "model": "glm-ocr:latest",
      "host": "localhost",
      "port": 11434,
      "timeout_ms": 60000,
      "idle_seconds": 12,
      "age_seconds": 45
    }
  ]
}
```

#### Degraded response (`glmocr` import issue)

- Status: `200 OK`

```json
{
  "status": "degraded",
  "reason": "glmocr import failed: <details>",
  "idle_timeout_seconds": 900,
  "cache_size": 0,
  "loaded_models": []
}
```

#### Error response

- Internal server error path exists (for example, cache listing failure): `500 Internal Server Error`.

---

### POST /layout/augment

Used by the layout-augmented OCR pipeline.

#### Request contract (service implementation)

- Method: `POST`
- Path: `/layout/augment`
- Headers: `Content-Type: application/json`
- JSON body:

```json
{
  "image_base64": "<base64-image>",
  "ollama_endpoint": "http://localhost:11434/",
  "ollama_model": "glm-ocr:latest",
  "timeout_ms": 60000
}
```

Field constraints:

- `image_base64`: required, minimum length 16
- `ollama_endpoint`: optional, default `http://localhost:11434/`
- `ollama_model`: optional, default `glm-ocr:latest`
- `timeout_ms`: optional, range `1000..600000`, default `60000`

#### Success response

- Status: `200 OK`
- JSON body:

```json
{
  "ocr_text": "<extracted text>",
  "regions": [
    {
      "id": "r1",
      "page": 1,
      "label": "text",
      "content": "<region text>",
      "bbox": {
        "x1": 12.0,
        "y1": 24.0,
        "x2": 220.0,
        "y2": 64.0
      }
    }
  ],
  "raw": {
    "...": "optional raw payload"
  }
}
```

Response semantics:

- `regions[].label` is the region type/class emitted by GLM-OCR layout detection (for example: `title`, `text`, `table`, `figure`, `formula`, `header`, `footer`, `page_number`, `reference`, `seal`).
- `regions[].bbox` coordinates (`x1`, `y1`, `x2`, `y2`) are normalized to a `0..1000` coordinate space.
- Convert normalized coordinates back to absolute image pixels using:
  - `x_abs = (x_norm / 1000) * image_width`
  - `y_abs = (y_norm / 1000) * image_height`
  - `w_abs = ((x2_norm - x1_norm) / 1000) * image_width`
  - `h_abs = ((y2_norm - y1_norm) / 1000) * image_height`

#### Error responses

- `422 Unprocessable Entity`: request validation failures (for example missing required fields)
- `400 Bad Request`: invalid base64 payload
- `500 Internal Server Error`: service configuration/import failure
- `502 Bad Gateway`: parse failed for all Ollama endpoint candidates

---

## Compatibility Note: Layout Request Shape

Current extension layout client code sends this body:

```json
{
  "image": "<base64-image>",
  "parserConfig": {
    "chunkStrategy": "prompt-only",
    "maxChunkSize": 1200,
    "debugRawPayload": false
  }
}
```

Current GLM-OCR service expects `image_base64` (not `image`) plus optional Ollama settings, as documented above.

If these two components are used together directly, align the payload contract on one side (client adapter or service alias fields) to avoid request validation failures.
