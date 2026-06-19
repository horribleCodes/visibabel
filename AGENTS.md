# Agent instructions

Execution rules for coding agents working in this repository.

## Repository layout

- `extension/` — Chrome MV3 browser extension (TypeScript)
- `glm-ocr/` — Python FastAPI GLM-OCR layout augmentation service
- `ollama/` — shared dev tooling (Ollama launcher scripts and endpoint tests)
- `resources/` — shared test images (Git LFS)

## Execution rules

- Use the repository root as the default working directory unless a task explicitly sets a subfolder.
- Keep changes focused and avoid unrelated file churn.
- Prefer existing scripts over ad-hoc commands when possible.
- After changing any TypeScript file under `extension/src/`, run:
  ```bash
  npm --prefix ./extension run build:extension
  ```
  before running tests or runtime E2E checks.

## Python environment

Create and use a virtual environment under `glm-ocr/.venv`:

```powershell
cd glm-ocr
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
```

Linux/macOS:

```bash
cd glm-ocr
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

## Canonical test commands

From repository root:

```bash
npm --prefix ./extension run test:unit
npm --prefix ./extension run verify:emit-sync
npm --prefix ./ollama run test:negative
pytest glm-ocr/tests/test_service_negative.py -v
```

Integration tests (require live Ollama + GLM-OCR service):

```bash
npm --prefix ./ollama run test:integration
pytest glm-ocr/tests/test_service_integration.py -v
```

Start services before integration tests:

```bash
npm --prefix ./ollama run start:ollama
# separate terminal
cd glm-ocr && ./run-service.sh   # or run-service.ps1 on Windows
```

## Test data rules

- Test image paths in code and scripts must reference repo-root `resources/` unless a test intentionally verifies alternate path behavior.
- Update helper/test utilities whenever image path conventions change.

## Debug targets

- Extension: load unpacked from `extension/` after `npm run build:extension`
- GLM-OCR API: `http://localhost:5002/health`
- Ollama: `http://localhost:11434/api/tags`
