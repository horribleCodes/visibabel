# Negative/edge case tests for GLM-OCR service
# Framework: pytest


import base64
import sys
import threading
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient
from app import main as service_main


def test_augment_rejects_missing_fields():
    with TestClient(service_main.app) as client:
        response = client.post("/layout/augment", json={})

    # FastAPI request validation returns 422 for missing required fields.
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], list)
    assert len(data["detail"]) > 0


def test_augment_rejects_unsupported_format(monkeypatch):
    class FakeParser:
        def parse(self, _image_path):
            raise ValueError("unsupported image format")

    def fake_get_or_create_cached_parser(**_kwargs):
        return (
            "fake-cache-key",
            {"parse_lock": threading.Lock(), "parser": FakeParser()},
            True,
        )

    monkeypatch.setattr(service_main, "GLMOCR_IMPORT_ERROR", None)
    monkeypatch.setattr(service_main, "GlmOcr", object())
    monkeypatch.setattr(
        service_main,
        "get_or_create_cached_parser",
        fake_get_or_create_cached_parser,
    )
    monkeypatch.setattr(
        service_main,
        "build_ollama_candidates",
        lambda _ep: [("localhost", 11434)],
    )
    monkeypatch.setattr(service_main, "evict_idle_parsers", lambda: 0)
    monkeypatch.setattr(service_main, "close_cached_parser", lambda _key: None)

    payload = {
        "image_base64": base64.b64encode(b"not-an-image").decode("utf-8"),
        "ollama_endpoint": "http://localhost:11434",
        "ollama_model": "glm-ocr:latest",
        "timeout_ms": 5000,
    }

    with TestClient(service_main.app) as client:
        response = client.post("/layout/augment", json=payload)

    assert response.status_code == 502
    detail = response.json().get("detail", "")
    assert "parse failed" in detail.lower()
    assert "unsupported image format" in detail.lower()


def test_health_endpoint_handles_internal_error(monkeypatch):
    def explode():
        raise RuntimeError("simulated cache listing failure")

    monkeypatch.setattr(service_main, "list_loaded_model_sessions", explode)

    with TestClient(service_main.app, raise_server_exceptions=False) as client:
        response = client.get("/health")

    assert response.status_code == 500
    assert "Internal Server Error" in response.text
