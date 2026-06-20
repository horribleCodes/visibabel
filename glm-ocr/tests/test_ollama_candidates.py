import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import main as service_main


def test_localhost_without_env_uses_loopback_fallbacks(monkeypatch):
    monkeypatch.delenv("GLMOCR_OLLAMA_ENDPOINT", raising=False)

    candidates = service_main.build_ollama_candidates("http://localhost:11434/")

    assert candidates[0] == ("localhost", 11434)
    assert ("host.docker.internal", 11434) in candidates


def test_localhost_with_docker_env_prepends_ollama_service(monkeypatch):
    monkeypatch.setenv("GLMOCR_OLLAMA_ENDPOINT", "http://ollama:11434")

    candidates = service_main.build_ollama_candidates("http://localhost:11434/")

    assert candidates[0] == ("ollama", 11434)
    assert ("localhost", 11434) in candidates
    assert ("host.docker.internal", 11434) in candidates


def test_loopback_ip_with_docker_env_prepends_ollama_service(monkeypatch):
    monkeypatch.setenv("GLMOCR_OLLAMA_ENDPOINT", "http://ollama:11434")

    candidates = service_main.build_ollama_candidates("http://127.0.0.1:11434/")

    assert candidates[0] == ("ollama", 11434)
    assert ("127.0.0.1", 11434) in candidates
    assert ("localhost", 11434) in candidates


def test_non_loopback_host_does_not_use_docker_env(monkeypatch):
    monkeypatch.setenv("GLMOCR_OLLAMA_ENDPOINT", "http://ollama:11434")

    candidates = service_main.build_ollama_candidates("http://192.168.1.5:11434/")

    assert candidates == [("192.168.1.5", 11434)]


def test_docker_env_default_port(monkeypatch):
    monkeypatch.setenv("GLMOCR_OLLAMA_ENDPOINT", "http://ollama")

    candidates = service_main.build_ollama_candidates("http://localhost:11434/")

    assert candidates[0] == ("ollama", 11434)
