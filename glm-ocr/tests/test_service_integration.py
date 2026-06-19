# Integration tests for GLM-OCR service
# Framework: pytest


import base64
import requests
import sys
from pathlib import Path

from ollama_request_helper import warm_up_ollama_ocr

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

SERVICE_URL = "http://localhost:5002/layout/augment"
OLLAMA_ENDPOINT = "http://localhost:11434"
OLLAMA_MODEL = "glm-ocr:latest"


def get_test_image_base64():
    # Load test_2.png from the workspace resources folder
    image_path = Path(__file__).resolve().parents[2] / "resources" / "test_2.png"
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def test_ocr_with_real_image():
    image_base64 = get_test_image_base64()

    # Ensure layout test uses a real, warmed-up Ollama OCR model path.
    warm_up_ollama_ocr(
        image_base64=image_base64,
        ollama_endpoint=OLLAMA_ENDPOINT,
        ollama_model=OLLAMA_MODEL,
        timeout_seconds=180,
        retries=1,
    )

    payload = {
        "image_base64": image_base64,
        "ollama_endpoint": OLLAMA_ENDPOINT,
        "ollama_model": OLLAMA_MODEL,
        "timeout_ms": 120000,
    }
    # Allow cold start/model load latency on the first OCR request.
    resp = requests.post(SERVICE_URL, json=payload, timeout=180)
    assert resp.status_code == 200
    data = resp.json()
    assert "ocr_text" in data
    assert isinstance(data["ocr_text"], str)
    # Accept empty text, but must be present
    assert "regions" in data
    assert isinstance(data["regions"], list)
    assert len(data["regions"]) > 0

    def has_non_zero_bbox(region: dict) -> bool:
        bbox = region.get("bbox") if isinstance(region, dict) else None
        if not isinstance(bbox, dict):
            return False

        x1 = float(bbox.get("x1", 0) or 0)
        y1 = float(bbox.get("y1", 0) or 0)
        x2 = float(bbox.get("x2", 0) or 0)
        y2 = float(bbox.get("y2", 0) or 0)

        return x1 != 0 or y1 != 0 or x2 != 0 or y2 != 0

    assert any(has_non_zero_bbox(region) for region in data["regions"]), (
        "Expected at least one region to include non-zero bbox coordinates"
    )


def test_ocr_handles_invalid_image():
    payload = {
        "image_base64": "not-a-valid-base64",
        "ollama_endpoint": OLLAMA_ENDPOINT,
        "ollama_model": OLLAMA_MODEL,
        "timeout_ms": 5000,
    }
    resp = requests.post(SERVICE_URL, json=payload, timeout=10)
    # Should return 400 or 422 for invalid input
    assert resp.status_code in (400, 422, 500)
    data = resp.json()
    # Should contain error message
    assert any(k in data for k in ("error", "message", "detail"))


def test_ocr_handles_model_download_failure(monkeypatch):
    # Simulate by patching requests.post to always return a 500 error for model download
    # (Assumes the service tries to download model if not present)
    orig_post = requests.post

    def fake_post(*args, **kwargs):
        if args and SERVICE_URL in args[0]:

            class FakeResp:
                status_code = 500

                def json(self):
                    return {"error": "Model download failed"}

            return FakeResp()
        return orig_post(*args, **kwargs)

    monkeypatch.setattr(requests, "post", fake_post)
    payload = {
        "image_base64": get_test_image_base64(),
        "ollama_endpoint": OLLAMA_ENDPOINT,
        "ollama_model": "nonexistent-model",
        "timeout_ms": 5000,
    }
    resp = requests.post(SERVICE_URL, json=payload, timeout=10)
    assert resp.status_code == 500
    data = resp.json()
    assert "error" in data and "download" in data["error"].lower()
