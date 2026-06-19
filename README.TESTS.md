# Test suite overview

## API reference

- Endpoint request/response reference: [`docs/ENDPOINT_API_REFERENCE.md`](docs/ENDPOINT_API_REFERENCE.md)

## Extension build and test commands

Build emitted extension runtime files from TypeScript:

```bash
cd extension
npm install
npm run build:extension
```

Verify emitted files are in sync with TypeScript:

```bash
npm --prefix ./extension run verify:emit-sync
```

Run extension unit tests:

```bash
npm --prefix ./extension run test:unit
```

Run extension runtime E2E (Playwright + unpacked extension):

```bash
npm --prefix ./extension run test:e2e
```

## Ollama (Node.js)

Negative tests (no live Ollama required for most cases):

```bash
npm --prefix ./ollama run test:negative
```

Integration tests (require running Ollama with `glm-ocr:latest`):

```bash
npm --prefix ./ollama run test:integration
```

All Ollama tests:

```bash
npm --prefix ./ollama test
```

## GLM-OCR service (Python)

Activate `glm-ocr/.venv` first, then:

```bash
pytest glm-ocr/tests/test_service_negative.py -v
pytest glm-ocr/tests/test_service_integration.py -v
```

Integration tests require a running GLM-OCR service on port 5002 and Ollama on port 11434.

## CI coverage

GitHub Actions runs by default:

- Extension unit tests and emit sync verification
- Ollama negative tests
- GLM-OCR negative tests

Integration tests are documented for local runs only (they need Ollama model pull and GPU/CPU inference time).

## Test images

Shared images live in `resources/`:

- `test_1.png` — small OCR smoke image (Japanese)
- `test_2.png` — multi-region layout image (Chinese, Arabic, Korean)
