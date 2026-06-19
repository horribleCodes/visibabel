"""Helpers for exercising the real Ollama endpoint during integration tests."""

from __future__ import annotations

from typing import Any

import requests


def _endpoint_url(base_endpoint: str, api_path: str) -> str:
    return f"{base_endpoint.rstrip('/')}{api_path}"


def warm_up_ollama_ocr(
    *,
    image_base64: str,
    ollama_endpoint: str,
    ollama_model: str,
    timeout_seconds: int = 180,
    retries: int = 2,
) -> dict[str, Any]:
    """Send a real OCR request to Ollama to warm up model/runtime before tests.

    Returns the decoded JSON payload from Ollama.
    Raises AssertionError with actionable details if the call does not succeed.
    """
    url = _endpoint_url(ollama_endpoint, "/api/generate")
    payload = {
        "model": ollama_model,
        "prompt": "Read text from this image and return plain text only.",
        "stream": False,
        "images": [image_base64],
    }

    last_error: Exception | None = None
    attempts = max(1, retries + 1)

    for attempt in range(1, attempts + 1):
        try:
            response = requests.post(url, json=payload, timeout=timeout_seconds)
            if response.status_code != 200:
                raise AssertionError(
                    "Ollama warm-up failed "
                    f"(attempt {attempt}/{attempts}) with status "
                    f"{response.status_code}: {response.text[:500]}"
                )

            data = response.json()
            if not isinstance(data, dict):
                raise AssertionError("Ollama warm-up returned a non-JSON object")

            if "response" not in data:
                raise AssertionError("Ollama warm-up response missing 'response' field")

            return data
        except Exception as exc:
            last_error = exc
            if attempt == attempts:
                break

    raise AssertionError(
        "Ollama warm-up request failed after retries: "
        f"{type(last_error).__name__}: {last_error}"
    )
