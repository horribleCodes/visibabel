import base64
from contextlib import asynccontextmanager
import json
import logging
import os
import tempfile
import threading
import time
from typing import Any
from urllib.parse import urlparse

import yaml
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from glmocr import GlmOcr  # type: ignore[import-not-found]
except ImportError as import_error:  # pragma: no cover
    GlmOcr = None
    GLMOCR_IMPORT_ERROR = import_error
else:
    GLMOCR_IMPORT_ERROR = None


# Route service logs through Uvicorn's configured logger so info-level messages
# are visible in the same output stream as request logs.
logger = logging.getLogger("uvicorn.error")

DEFAULT_LAYOUT_MODEL_DIR = "PaddlePaddle/PP-DocLayoutV3_safetensors"
DEFAULT_MODEL_IDLE_TIMEOUT_SECONDS = 15 * 60
DEFAULT_LAYOUT_MODEL_CACHE_DIR = "models/layout"

parser_cache_lock = threading.Lock()
parser_cache: dict[str, dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        yield
    finally:
        closed = close_all_cached_parsers()
        if closed:
            logger.info("Closed %s cached parser session(s) during shutdown", closed)


app = FastAPI(
    title="visibabel-glmocr-service",
    version="0.1.0",
    lifespan=lifespan,
)


class LayoutAugmentRequest(BaseModel):
    image_base64: str = Field(min_length=16)
    ollama_endpoint: str = Field(default="http://localhost:11434/")
    ollama_model: str = Field(default="glm-ocr:latest")
    timeout_ms: int = Field(default=60000, ge=1000, le=600000)


class RegionOut(BaseModel):
    id: str
    page: int
    label: str
    content: str
    bbox: dict[str, float]


class LayoutAugmentResponse(BaseModel):
    ocr_text: str
    regions: list[RegionOut]
    raw: dict[str, Any] | None = None


def resolve_model_idle_timeout_seconds() -> int:
    seconds_raw = os.getenv("GLMOCR_MODEL_IDLE_TIMEOUT_SECONDS", "").strip()
    if seconds_raw:
        try:
            parsed_seconds = int(seconds_raw)
            return max(1, parsed_seconds)
        except Exception:
            logger.warning(
                "Invalid GLMOCR_MODEL_IDLE_TIMEOUT_SECONDS value: %s",
                seconds_raw,
            )

    minutes_raw = os.getenv("GLMOCR_MODEL_IDLE_TIMEOUT_MINUTES", "").strip()
    if minutes_raw:
        try:
            parsed_minutes = int(minutes_raw)
            return max(1, parsed_minutes * 60)
        except Exception:
            logger.warning(
                "Invalid GLMOCR_MODEL_IDLE_TIMEOUT_MINUTES value: %s",
                minutes_raw,
            )

    return DEFAULT_MODEL_IDLE_TIMEOUT_SECONDS


def build_parser_cache_key(host: str, port: int, model: str, timeout_ms: int) -> str:
    return f"{host}:{int(port)}|{model}|{int(timeout_ms)}"


def close_parser_entry(entry: dict[str, Any]) -> None:
    parser = entry.get("parser")
    if parser is not None:
        try:
            close_method = getattr(parser, "close", None)
            if callable(close_method):
                close_method()
        except Exception as exc:
            logger.warning("Failed to close cached parser cleanly: %s", exc)

    runtime_config_path = entry.get("runtime_config_path")
    if isinstance(runtime_config_path, str) and runtime_config_path:
        try:
            os.unlink(runtime_config_path)
        except OSError:
            pass


def close_cached_parser(cache_key: str) -> bool:
    with parser_cache_lock:
        entry = parser_cache.pop(cache_key, None)

    if entry is None:
        return False

    close_parser_entry(entry)
    return True


def close_all_cached_parsers() -> int:
    with parser_cache_lock:
        entries = list(parser_cache.values())
        parser_cache.clear()

    for entry in entries:
        close_parser_entry(entry)

    return len(entries)


def touch_cached_parser(cache_key: str) -> None:
    now = time.time()
    with parser_cache_lock:
        entry = parser_cache.get(cache_key)
        if entry is not None:
            entry["last_used"] = now


def evict_idle_parsers(force: bool = False) -> int:
    timeout_seconds = resolve_model_idle_timeout_seconds()
    now = time.time()

    with parser_cache_lock:
        if force:
            keys_to_evict = list(parser_cache.keys())
        else:
            keys_to_evict = [
                key
                for key, entry in parser_cache.items()
                if now - float(entry.get("last_used", now)) >= timeout_seconds
            ]

        entries_to_close = [
            parser_cache.pop(key) for key in keys_to_evict if key in parser_cache
        ]

    for entry in entries_to_close:
        close_parser_entry(entry)

    return len(entries_to_close)


def get_or_create_cached_parser(
    base_config_path: str,
    host: str,
    port: int,
    model: str,
    timeout_ms: int,
) -> tuple[str, dict[str, Any], bool]:
    cache_key = build_parser_cache_key(host, port, model, timeout_ms)
    now = time.time()

    with parser_cache_lock:
        existing = parser_cache.get(cache_key)
        if existing is not None:
            existing["last_used"] = now
            return cache_key, existing, False

    runtime_config_path = build_runtime_config(
        base_path=base_config_path,
        host=host,
        port=port,
        model=model,
        timeout_ms=timeout_ms,
    )

    if GlmOcr is None:
        raise RuntimeError("glmocr is not available")

    parser = GlmOcr(config_path=runtime_config_path)
    new_entry: dict[str, Any] = {
        "cache_key": cache_key,
        "host": host,
        "port": int(port),
        "model": model,
        "timeout_ms": int(timeout_ms),
        "created_at": now,
        "last_used": now,
        "runtime_config_path": runtime_config_path,
        "parser": parser,
        "parse_lock": threading.Lock(),
    }

    with parser_cache_lock:
        existing = parser_cache.get(cache_key)
        if existing is not None:
            existing["last_used"] = now
            should_close_new = True
        else:
            parser_cache[cache_key] = new_entry
            should_close_new = False

    if should_close_new:
        close_parser_entry(new_entry)
        if existing is None:
            # Defensive guard for static type checkers; race path expects existing.
            raise RuntimeError("Cached parser race detected without existing entry")
        return cache_key, existing, False

    return cache_key, new_entry, True


def list_loaded_model_sessions() -> list[dict[str, Any]]:
    now = time.time()
    with parser_cache_lock:
        entries = list(parser_cache.values())

    loaded_models: list[dict[str, Any]] = []
    for entry in entries:
        created_at = float(entry.get("created_at", now))
        last_used = float(entry.get("last_used", created_at))
        loaded_models.append(
            {
                "cache_key": str(entry.get("cache_key", "")),
                "model": str(entry.get("model", "")),
                "host": str(entry.get("host", "")),
                "port": int(entry.get("port", 0) or 0),
                "timeout_ms": int(entry.get("timeout_ms", 0) or 0),
                "idle_seconds": max(0, int(now - last_used)),
                "age_seconds": max(0, int(now - created_at)),
            }
        )

    loaded_models.sort(
        key=lambda item: (
            item.get("model", ""),
            item.get("host", ""),
            item.get("port", 0),
        )
    )
    return loaded_models


def decode_image_base64(value: str) -> bytes:
    payload = value.strip()
    if payload.startswith("data:image") and "," in payload:
        payload = payload.split(",", 1)[1]
    try:
        return base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid image_base64 payload: {exc}"
        )


def normalize_bbox(raw: Any) -> dict[str, float] | None:
    if isinstance(raw, list) and len(raw) == 4:
        try:
            x1, y1, x2, y2 = [float(v) for v in raw]
        except Exception:
            return None
        return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}

    if isinstance(raw, dict):
        keys = ("x1", "y1", "x2", "y2")
        if all(k in raw for k in keys):
            try:
                return {k: float(raw[k]) for k in keys}
            except Exception:
                return None
        location_keys = ("left", "top", "width", "height")
        if all(k in raw for k in location_keys):
            try:
                left = float(raw["left"])
                top = float(raw["top"])
                width = float(raw["width"])
                height = float(raw["height"])
            except Exception:
                return None
            return {
                "x1": left,
                "y1": top,
                "x2": left + width,
                "y2": top + height,
            }

    return None


def extract_regions_recursive(
    node: Any, out: list[RegionOut], state: dict[str, int]
) -> None:
    if isinstance(node, dict):
        bbox = normalize_bbox(
            node.get("bbox_2d") or node.get("bbox") or node.get("location")
        )
        if bbox is not None:
            state["counter"] += 1
            page_raw = node.get("page")
            try:
                page = max(1, int(page_raw)) if page_raw is not None else 1
            except Exception:
                page = 1
            label = str(node.get("label") or "text")
            content = str(
                node.get("content") or node.get("text") or node.get("words") or ""
            )
            out.append(
                RegionOut(
                    id=f"r{state['counter']}",
                    page=page,
                    label=label,
                    content=content,
                    bbox=bbox,
                )
            )

        for value in node.values():
            extract_regions_recursive(value, out, state)
        return

    if isinstance(node, list):
        for item in node:
            extract_regions_recursive(item, out, state)


def parse_json_result(raw_json: Any) -> Any:
    if isinstance(raw_json, str):
        try:
            return json.loads(raw_json)
        except Exception:
            return {"raw_json_result": raw_json}
    return raw_json


def extract_ocr_text(
    result_obj: Any, json_payload: Any, regions: list[RegionOut]
) -> str:
    markdown_result = getattr(result_obj, "markdown_result", "")
    if isinstance(markdown_result, str) and markdown_result.strip():
        return markdown_result.strip()

    if isinstance(json_payload, dict):
        for key in ("ocr_text", "text", "content", "markdown_result"):
            value = json_payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    text_parts = [region.content for region in regions if region.content]
    return "\n".join(text_parts).strip()


def read_wsl_host_ip() -> str | None:
    """Read the Windows host-side IP from WSL resolver config when available."""
    if os.name != "posix":
        return None

    resolv_conf = "/etc/resolv.conf"
    if not os.path.exists(resolv_conf):
        return None

    try:
        with open(resolv_conf, "r", encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped.startswith("nameserver "):
                    continue
                parts = stripped.split()
                if len(parts) >= 2 and parts[1]:
                    return parts[1]
    except Exception:
        return None

    return None


def build_ollama_candidates(endpoint: str) -> list[tuple[str, int]]:
    endpoint_value = endpoint.strip() or "http://localhost:11434/"

    try:
        parsed = urlparse(endpoint_value)
        host = parsed.hostname or "localhost"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except Exception:
        host = "localhost"
        port = 11434

    candidates: list[tuple[str, int]] = []

    def add_candidate(candidate_host: str, candidate_port: int) -> None:
        normalized_host = str(candidate_host or "").strip()
        if not normalized_host:
            return
        entry = (normalized_host, int(candidate_port))
        if entry not in candidates:
            candidates.append(entry)

    add_candidate(host, port)

    if host in {"localhost", "::1"}:
        add_candidate("localhost", port)
        add_candidate("host.docker.internal", port)

        wsl_host = read_wsl_host_ip()
        if wsl_host:
            add_candidate(wsl_host, port)

    return candidates


def build_runtime_config(
    base_path: str,
    host: str,
    port: int,
    model: str,
    timeout_ms: int,
) -> str:
    project_root = os.path.dirname(os.path.abspath(base_path))

    def deep_merge_dict(
        base: dict[str, Any], override: dict[str, Any]
    ) -> dict[str, Any]:
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                deep_merge_dict(base[key], value)
            else:
                base[key] = value
        return base

    def load_selfhosted_pipeline_defaults() -> dict[str, Any]:
        # Newer glmocr releases require explicit layout config for self-hosted mode.
        # Pull the SDK defaults so our generated config stays aligned upstream.
        try:
            from glmocr.config import load_config  # type: ignore[import-not-found]

            cfg = load_config(mode="selfhosted")
            pipeline_obj = getattr(cfg, "pipeline", None)
            if pipeline_obj is not None and hasattr(pipeline_obj, "model_dump"):
                dumped = pipeline_obj.model_dump(exclude_none=True)
                if isinstance(dumped, dict):
                    return dumped

            if hasattr(cfg, "to_dict"):
                dumped = cfg.to_dict()
                if isinstance(dumped, dict):
                    pipeline_dump = dumped.get("pipeline")
                    if isinstance(pipeline_dump, dict):
                        return pipeline_dump
        except Exception as exc:
            logger.warning(
                "Unable to load glmocr self-hosted defaults, falling back to local config: %s",
                exc,
            )

        return {}

    def is_local_path(value: str) -> bool:
        if not value:
            return False
        if os.path.isabs(value):
            return True
        if value.startswith((".", "~")):
            return True
        return ("\\" in value) or (os.sep in value)

    def has_any_files(path: str) -> bool:
        if not os.path.isdir(path):
            return False
        try:
            with os.scandir(path) as entries:
                return any(True for _ in entries)
        except Exception:
            return False

    def looks_like_hf_repo_id(value: str) -> bool:
        # Keep this intentionally strict enough to avoid treating ordinary paths
        # as repo IDs while still supporting namespace/repo style identifiers.
        if not value or "\\" in value:
            return False
        if value.startswith(("/", "./", "../", "~/")):
            return False
        if value.count("/") != 1:
            return False
        namespace, repo = value.split("/", 1)
        if not namespace or not repo:
            return False
        return (" " not in namespace) and (" " not in repo)

    def resolve_layout_model_dir(configured_value: Any) -> str:
        env_override = os.getenv("GLMOCR_LAYOUT_MODEL_DIR", "").strip()
        configured = (
            str(configured_value).strip() if isinstance(configured_value, str) else ""
        )
        selected = configured or DEFAULT_LAYOUT_MODEL_DIR

        if env_override:
            expanded = os.path.abspath(os.path.expanduser(env_override))
            if not os.path.exists(expanded):
                logger.warning(
                    "Configured layout model path does not exist yet: %s",
                    expanded,
                )
            logger.info(
                "Layout model source: local path override (GLMOCR_LAYOUT_MODEL_DIR) -> %s",
                expanded,
            )
            return expanded

        if is_local_path(selected) and not looks_like_hf_repo_id(selected):
            expanded = os.path.expanduser(selected)
            if not os.path.isabs(expanded):
                expanded = os.path.abspath(os.path.join(project_root, expanded))
            if not os.path.exists(expanded):
                logger.warning(
                    "Configured layout model path does not exist yet: %s",
                    expanded,
                )
            logger.info(
                "Layout model source: configured local path -> %s",
                expanded,
            )
            return expanded

        # For Hugging Face repo IDs, keep a local persistent cache path in the project.
        cache_root = os.path.join(project_root, DEFAULT_LAYOUT_MODEL_CACHE_DIR)
        local_dir = os.path.join(cache_root, selected.replace("/", "--"))

        if has_any_files(local_dir):
            logger.info(
                "Layout model source: local cache hit for %s -> %s",
                selected,
                local_dir,
            )
            return local_dir

        try:
            from huggingface_hub import snapshot_download

            os.makedirs(local_dir, exist_ok=True)
            logger.info(
                "Layout model not found locally; downloading %s to %s",
                selected,
                local_dir,
            )
            downloaded_path = snapshot_download(
                repo_id=selected,
                local_dir=local_dir,
            )
            resolved_path = (
                downloaded_path if isinstance(downloaded_path, str) else local_dir
            )
            logger.info(
                "Layout model source: downloaded from Hugging Face %s -> %s",
                selected,
                resolved_path,
            )
            return resolved_path
        except Exception as exc:
            logger.warning(
                "Unable to prefetch layout model %s: %s. Falling back to SDK default resolution.",
                selected,
                exc,
            )
            logger.info(
                "Layout model source: Hugging Face repo id passthrough -> %s",
                selected,
            )
            return selected

    with open(base_path, "r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    sdk_pipeline_defaults = load_selfhosted_pipeline_defaults()
    local_pipeline = config.get("pipeline")

    pipeline: dict[str, Any] = {}
    if isinstance(sdk_pipeline_defaults, dict):
        deep_merge_dict(pipeline, sdk_pipeline_defaults)
    if isinstance(local_pipeline, dict):
        deep_merge_dict(pipeline, local_pipeline)

    config["pipeline"] = pipeline

    maas = pipeline.setdefault("maas", {})
    maas["enabled"] = False

    ocr_api = pipeline.setdefault("ocr_api", {})
    ocr_api["api_host"] = host
    ocr_api["api_port"] = int(port)
    ocr_api["api_path"] = "/api/generate"
    ocr_api["model"] = model
    ocr_api["api_mode"] = "ollama_generate"

    timeout_seconds = max(1, int(timeout_ms / 1000))
    ocr_api["request_timeout"] = timeout_seconds

    layout = pipeline.setdefault("layout", {})
    layout["model_dir"] = resolve_layout_model_dir(layout.get("model_dir"))

    fd, path = tempfile.mkstemp(prefix="glmocr-config-", suffix=".yaml")
    os.close(fd)
    with open(path, "w", encoding="utf-8") as handle:
        yaml.safe_dump(config, handle, allow_unicode=True, sort_keys=False)
    return path


@app.get("/health")
def health() -> dict[str, Any]:
    evicted = evict_idle_parsers()
    if evicted:
        logger.info("Evicted %s idle parser session(s)", evicted)

    timeout_seconds = resolve_model_idle_timeout_seconds()
    loaded_models = list_loaded_model_sessions()

    if GLMOCR_IMPORT_ERROR is not None:
        return {
            "status": "degraded",
            "reason": f"glmocr import failed: {GLMOCR_IMPORT_ERROR}",
            "idle_timeout_seconds": timeout_seconds,
            "cache_size": len(loaded_models),
            "loaded_models": loaded_models,
        }
    return {
        "status": "ok",
        "idle_timeout_seconds": timeout_seconds,
        "cache_size": len(loaded_models),
        "loaded_models": loaded_models,
    }


@app.post("/layout/augment", response_model=LayoutAugmentResponse)
def layout_augment(request: LayoutAugmentRequest) -> LayoutAugmentResponse:
    if GLMOCR_IMPORT_ERROR is not None:
        raise HTTPException(
            status_code=500,
            detail=f"glmocr import failed: {GLMOCR_IMPORT_ERROR}",
        )
    if GlmOcr is None:
        raise HTTPException(status_code=500, detail="glmocr is not available")

    image_bytes = decode_image_base64(request.image_base64)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base_config = os.path.join(project_root, "config.yaml")

    if not os.path.exists(base_config):
        raise HTTPException(status_code=500, detail="glm-ocr config.yaml not found")

    model = request.ollama_model.strip() or "glm-ocr:latest"
    candidates = build_ollama_candidates(request.ollama_endpoint)
    evicted = evict_idle_parsers()
    if evicted:
        logger.info("Evicted %s idle parser session(s)", evicted)

    with tempfile.NamedTemporaryFile(
        prefix="glmocr-image-", suffix=".png", delete=False
    ) as tmp_image:
        tmp_image.write(image_bytes)
        image_path = tmp_image.name

    result: Any = None
    parse_errors: list[str] = []
    try:
        for host, port in candidates:
            cache_key = ""
            try:
                cache_key, entry, created = get_or_create_cached_parser(
                    base_config_path=base_config,
                    host=host,
                    port=port,
                    model=model,
                    timeout_ms=request.timeout_ms,
                )

                logger.info(
                    "%s cached parser session host=%s port=%s model=%s",
                    "Created" if created else "Reusing",
                    host,
                    port,
                    model,
                )

                parse_lock = entry.get("parse_lock")
                parser = entry.get("parser")
                if parse_lock is None or parser is None:
                    raise RuntimeError("Cached parser entry is missing parser state")

                with parse_lock:
                    result = parser.parse(image_path)

                touch_cached_parser(cache_key)
                break
            except Exception as exc:
                parse_errors.append(f"{host}:{port} -> {exc}")
                logger.warning(
                    "Pipeline attempt failed for ollama host=%s port=%s: %s",
                    host,
                    port,
                    exc,
                )
                if cache_key:
                    close_cached_parser(cache_key)

        if result is None:
            attempts = "; ".join(parse_errors[-3:]) if parse_errors else "no attempts"
            raise HTTPException(
                status_code=502,
                detail=(
                    "glmocr parse failed for all Ollama candidates. "
                    f"Tried {len(candidates)} candidate(s): {attempts}"
                ),
            )
    finally:
        try:
            os.unlink(image_path)
        except OSError:
            pass

    json_payload = parse_json_result(getattr(result, "json_result", {}))
    regions: list[RegionOut] = []
    extract_regions_recursive(json_payload, regions, {"counter": 0})

    ocr_text = extract_ocr_text(result, json_payload, regions)

    return LayoutAugmentResponse(
        ocr_text=ocr_text,
        regions=regions,
        raw={
            "json_result": json_payload,
            "markdown_result": getattr(result, "markdown_result", None),
            "region_count": len(regions),
        },
    )
