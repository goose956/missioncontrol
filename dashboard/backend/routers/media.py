import json
import os
import subprocess
import sys
import hashlib
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

try:
    from pymediainfo import MediaInfo
except Exception:
    MediaInfo = None

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
MEDIA_WORKSPACE = ROOT / "workspaces" / "media"
CONFIG_PATH = MEDIA_WORKSPACE / "capture_config.json"
INDEX_PATH = MEDIA_WORKSPACE / "media_index.json"
HIGHLIGHTS_PATH = MEDIA_WORKSPACE / "highlights.json"
EVENTS_PATH = MEDIA_WORKSPACE / "events.json"
THUMBNAIL_INDEX_PATH = MEDIA_WORKSPACE / "thumbnails.json"
THUMBNAIL_DIR = MEDIA_WORKSPACE / "thumbnails"

VIDEO_EXTENSIONS = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".ts", ".mpeg", ".mpg"
}


class MediaConfig(BaseModel):
    screenpipe_data_dir: str
    screenpipe_api_url: str = "http://localhost:3030"
    external_media_dirs: list[str] = []
    auto_index_on_start: bool = False


class RefreshRequest(BaseModel):
    max_files: int = 2000


class HighlightsRequest(BaseModel):
    top_n: int = 20
    min_duration_seconds: float = 20.0
    workflow_id: str | None = None


class OpenPathRequest(BaseModel):
    path: str
    target: str = "file"


class OpenArtifactRequest(BaseModel):
    path: str
    target: str = "file"


class ThumbnailRequest(BaseModel):
    max_items: int = 40


def _default_config() -> dict[str, Any]:
    return {
        "screenpipe_data_dir": "",
        "screenpipe_api_url": "http://localhost:3030",
        "external_media_dirs": [],
        "auto_index_on_start": False,
        "updated_at": datetime.now().isoformat(),
    }


def _load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return _default_config()
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def _save_config(data: dict[str, Any]):
    MEDIA_WORKSPACE.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now().isoformat()
    CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def _load_index() -> dict[str, Any]:
    if not INDEX_PATH.exists():
        return {
            "updated_at": None,
            "media_files": [],
            "stats": {"count": 0, "total_size_bytes": 0, "indexed_dirs": []},
        }
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def _load_highlights() -> dict[str, Any]:
    if not HIGHLIGHTS_PATH.exists():
        return {"updated_at": None, "items": []}
    return json.loads(HIGHLIGHTS_PATH.read_text(encoding="utf-8"))


def _load_events() -> dict[str, Any]:
    if not EVENTS_PATH.exists():
        return {"updated_at": None, "items": []}
    return json.loads(EVENTS_PATH.read_text(encoding="utf-8"))


def _load_thumbnail_index() -> dict[str, Any]:
    if not THUMBNAIL_INDEX_PATH.exists():
        return {"updated_at": None, "items": []}
    return json.loads(THUMBNAIL_INDEX_PATH.read_text(encoding="utf-8"))


def _save_index(data: dict[str, Any]):
    MEDIA_WORKSPACE.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now().isoformat()
    INDEX_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def _save_highlights(data: dict[str, Any]):
    MEDIA_WORKSPACE.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now().isoformat()
    HIGHLIGHTS_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def _save_events(data: dict[str, Any]):
    MEDIA_WORKSPACE.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now().isoformat()
    EVENTS_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def _save_thumbnail_index(data: dict[str, Any]):
    MEDIA_WORKSPACE.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now().isoformat()
    THUMBNAIL_INDEX_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def record_event(event_type: str, payload: dict[str, Any] | None = None):
    data = _load_events()
    items = data.get("items") or []
    items.append({
        "type": event_type,
        "timestamp": datetime.now().isoformat(),
        "payload": payload or {},
    })
    # Keep latest 5000 events.
    data["items"] = items[-5000:]
    _save_events(data)


def _video_metadata(path: Path) -> dict[str, Any]:
    base = {
        "name": path.name,
        "path": str(path),
        "size_bytes": path.stat().st_size,
        "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
        "duration_seconds": None,
        "width": None,
        "height": None,
        "codec": None,
    }

    if MediaInfo is None:
        return base

    try:
        media_info = MediaInfo.parse(str(path))
        video_track = next((t for t in media_info.tracks if t.track_type == "Video"), None)
        if video_track:
            duration_ms = getattr(video_track, "duration", None)
            base["duration_seconds"] = float(duration_ms) / 1000.0 if duration_ms else None
            base["width"] = getattr(video_track, "width", None)
            base["height"] = getattr(video_track, "height", None)
            base["codec"] = getattr(video_track, "codec_id", None) or getattr(video_track, "format", None)
    except Exception:
        # If metadata extraction fails, keep basic file metadata.
        return base

    return base


def _collect_dirs(config: dict[str, Any]) -> list[Path]:
    dirs: list[Path] = []

    screenpipe_dir = (config.get("screenpipe_data_dir") or "").strip()
    if screenpipe_dir:
        dirs.append(Path(screenpipe_dir))

    for item in config.get("external_media_dirs", []) or []:
        if item and str(item).strip():
            dirs.append(Path(str(item).strip()))

    # De-duplicate while preserving order.
    unique: list[Path] = []
    seen = set()
    for d in dirs:
        key = str(d).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(d)
    return unique


def _is_allowed_media_path(path: Path, config: dict[str, Any]) -> bool:
    resolved = path.resolve()
    for base_dir in _collect_dirs(config):
        try:
            resolved.relative_to(base_dir.resolve())
            return True
        except ValueError:
            continue
    return False


def _open_path(path: Path):
    if sys.platform.startswith("win"):
        os.startfile(str(path))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


def _rebuild_index(max_files: int = 2000) -> dict[str, Any]:
    config = _load_config()
    dirs = _collect_dirs(config)

    media_files: list[dict[str, Any]] = []
    total_size = 0
    indexed_dirs: list[str] = []

    for base_dir in dirs:
        if not base_dir.exists() or not base_dir.is_dir():
            continue
        indexed_dirs.append(str(base_dir))

        for file in sorted(base_dir.rglob("*")):
            if len(media_files) >= max_files:
                break
            if not file.is_file() or file.suffix.lower() not in VIDEO_EXTENSIONS:
                continue
            item = _video_metadata(file)
            total_size += item["size_bytes"]
            media_files.append(item)

    media_files.sort(key=lambda x: x["modified"], reverse=True)
    result = {
        "media_files": media_files,
        "stats": {
            "count": len(media_files),
            "total_size_bytes": total_size,
            "indexed_dirs": indexed_dirs,
            "pymediainfo_enabled": MediaInfo is not None,
        },
    }
    _save_index(result)
    record_event("media_index_refresh", {
        "count": len(media_files),
        "indexed_dirs": indexed_dirs,
    })
    return _load_index()


def _recent_events(limit: int = 200) -> list[dict[str, Any]]:
    items = _load_events().get("items") or []
    return items[-limit:]


def _matching_event(file_item: dict[str, Any], events: list[dict[str, Any]], workflow_id: str | None = None) -> dict[str, Any] | None:
    file_mod = file_item.get("modified")
    if not file_mod:
        return None

    try:
        file_dt = datetime.fromisoformat(file_mod)
    except Exception:
        return None

    best: tuple[float, dict[str, Any]] | None = None
    for e in events:
        ts = e.get("timestamp")
        if not ts:
            continue
        payload = e.get("payload") or {}
        event_workflow_id = payload.get("workflow_id")
        if workflow_id and event_workflow_id != workflow_id:
            continue
        try:
            ev_dt = datetime.fromisoformat(ts)
        except Exception:
            continue
        delta = abs((file_dt - ev_dt).total_seconds())
        if delta <= 7200:
            if best is None or delta < best[0]:
                best = (delta, e)

    return best[1] if best else None


def _best_event_reason(file_item: dict[str, Any], events: list[dict[str, Any]], workflow_id: str | None = None) -> str:
    e = _matching_event(file_item, events, workflow_id)
    if e is None:
        return "duration>=threshold and recent"

    e_type = e.get("type", "event")
    payload = e.get("payload") or {}
    wf = payload.get("workflow_id")
    if wf:
        return f"near {e_type} ({wf})"
    return f"near {e_type}"


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _thumbnail_rel_path(video_path: str) -> str:
    digest = hashlib.sha1(video_path.encode("utf-8")).hexdigest()  # nosec B324
    return f"workspaces/media/thumbnails/{digest}.jpg"


def _generate_thumbnail_for(video_path: str) -> dict[str, Any]:
    src = Path(video_path)
    rel_thumb = _thumbnail_rel_path(video_path)
    out = ROOT / rel_thumb

    THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
    if out.exists():
        return {"source_path": video_path, "thumbnail_path": rel_thumb, "ok": True, "cached": True}

    cmd = [
        "ffmpeg", "-y", "-i", str(src), "-vf", "thumbnail,scale=640:-1", "-frames:v", "1", str(out)
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return {
            "source_path": video_path,
            "thumbnail_path": None,
            "ok": False,
            "cached": False,
            "error": (proc.stderr or "ffmpeg failed")[:600],
        }
    return {"source_path": video_path, "thumbnail_path": rel_thumb, "ok": True, "cached": False}


@router.get("/config")
def get_config():
    return _load_config()


@router.put("/config")
def update_config(body: MediaConfig):
    payload = {
        "screenpipe_data_dir": body.screenpipe_data_dir.strip(),
        "screenpipe_api_url": body.screenpipe_api_url.strip() or "http://localhost:3030",
        "external_media_dirs": [d.strip() for d in body.external_media_dirs if d and d.strip()],
        "auto_index_on_start": bool(body.auto_index_on_start),
    }
    _save_config(payload)
    return _load_config()


@router.get("/index")
def get_index():
    return _load_index()


@router.post("/index/refresh")
def refresh_index(body: RefreshRequest):
    if body.max_files < 1 or body.max_files > 20000:
        raise HTTPException(400, "max_files must be between 1 and 20000")
    return _rebuild_index(max_files=body.max_files)


@router.get("/status")
def media_status():
    cfg = _load_config()
    idx = _load_index()
    return {
        "configured": bool((cfg.get("screenpipe_data_dir") or "").strip() or (cfg.get("external_media_dirs") or [])),
        "config_updated_at": cfg.get("updated_at"),
        "index_updated_at": idx.get("updated_at"),
        "stats": idx.get("stats") or {},
    }


@router.post("/screenpipe/test")
def test_screenpipe():
    cfg = _load_config()
    api_url = (cfg.get("screenpipe_api_url") or "http://localhost:3030").rstrip("/")
    data_dir = (cfg.get("screenpipe_data_dir") or "").strip()

    api_ok = False
    api_error = None
    try:
        with urlopen(f"{api_url}/health", timeout=2.5) as response:  # nosec B310
            api_ok = 200 <= int(response.status) < 500
    except URLError as e:
        api_error = str(e)
    except Exception as e:
        api_error = str(e)

    dir_ok = False
    if data_dir:
        p = Path(data_dir)
        dir_ok = p.exists() and p.is_dir()

    return {
        "api_url": api_url,
        "api_ok": api_ok,
        "api_error": api_error,
        "data_dir": data_dir,
        "data_dir_exists": dir_ok,
    }


@router.get("/highlights")
def get_highlights():
    return _load_highlights()


@router.post("/highlights/extract")
def extract_highlights(body: HighlightsRequest):
    if body.top_n < 1 or body.top_n > 200:
        raise HTTPException(400, "top_n must be between 1 and 200")
    if body.min_duration_seconds < 0:
        raise HTTPException(400, "min_duration_seconds must be >= 0")

    idx = _load_index()
    files = idx.get("media_files") or []

    filtered = [
        item for item in files
        if (item.get("duration_seconds") or 0) >= body.min_duration_seconds
    ]
    events = _recent_events()

    workflow_id = (body.workflow_id or "").strip() or None
    if workflow_id:
        filtered = [item for item in filtered if _matching_event(item, events, workflow_id)]

    filtered.sort(key=lambda x: x.get("modified") or "", reverse=True)

    selected = filtered[:body.top_n]
    highlights = {
        "items": [
            {
                "path": item.get("path"),
                "name": item.get("name"),
                "duration_seconds": item.get("duration_seconds"),
                "modified": item.get("modified"),
                "reason": _best_event_reason(item, events, workflow_id),
            }
            for item in selected
        ]
    }
    _save_highlights(highlights)
    record_event("highlights_extract", {
        "selected": len(selected),
        "top_n": body.top_n,
        "min_duration_seconds": body.min_duration_seconds,
        "workflow_id": workflow_id,
    })
    return _load_highlights()


@router.get("/timeline")
def get_timeline(limit: int = 200, event_type: str | None = None, workflow_id: str | None = None):
    if limit < 1 or limit > 2000:
        raise HTTPException(400, "limit must be between 1 and 2000")
    items = _load_events().get("items") or []
    if event_type:
        items = [item for item in items if item.get("type") == event_type]
    if workflow_id:
        items = [item for item in items if (item.get("payload") or {}).get("workflow_id") == workflow_id]
    return {
        "updated_at": datetime.now().isoformat(),
        "items": list(reversed(items[-limit:])),
    }


@router.get("/thumbnails")
def get_thumbnails():
    data = _load_thumbnail_index()
    return {
        "updated_at": data.get("updated_at"),
        "ffmpeg_available": _ffmpeg_available(),
        "items": data.get("items") or [],
    }


@router.post("/thumbnails/generate")
def generate_thumbnails(body: ThumbnailRequest):
    if body.max_items < 1 or body.max_items > 500:
        raise HTTPException(400, "max_items must be between 1 and 500")
    if not _ffmpeg_available():
        raise HTTPException(400, "ffmpeg not available on PATH")

    idx = _load_index()
    files = idx.get("media_files") or []
    targets = files[: body.max_items]

    results = []
    for item in targets:
        path = item.get("path")
        if not path:
            continue
        results.append(_generate_thumbnail_for(path))

    payload = {"items": results}
    _save_thumbnail_index(payload)
    record_event("thumbnails_generate", {
        "attempted": len(targets),
        "ok": sum(1 for r in results if r.get("ok")),
    })

    data = _load_thumbnail_index()
    return {
        "updated_at": data.get("updated_at"),
        "ffmpeg_available": True,
        "items": data.get("items") or [],
    }


@router.post("/open-path")
def open_media_path(body: OpenPathRequest):
    cfg = _load_config()
    raw = (body.path or "").strip()
    if not raw:
        raise HTTPException(400, "path is required")

    path = Path(raw)
    if not path.exists():
        raise HTTPException(404, "path not found")
    if not _is_allowed_media_path(path, cfg):
        raise HTTPException(403, "path is outside configured media directories")

    target = (body.target or "file").lower()
    if target not in {"file", "folder"}:
        raise HTTPException(400, "target must be 'file' or 'folder'")

    open_target = path if target == "file" else path.parent
    try:
        _open_path(open_target)
    except Exception as e:
        raise HTTPException(500, f"failed to open path: {e}")

    return {"ok": True, "opened": str(open_target)}


@router.post("/open-artifact")
def open_artifact(body: OpenArtifactRequest):
    raw = (body.path or "").strip().lstrip("/")
    if not raw:
        raise HTTPException(400, "path is required")

    path = ROOT / raw
    try:
        path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        raise HTTPException(403, "artifact path is outside workspace")

    if not path.exists():
        raise HTTPException(404, "artifact not found")

    target = (body.target or "file").lower()
    if target not in {"file", "folder"}:
        raise HTTPException(400, "target must be 'file' or 'folder'")

    open_target = path if target == "file" else path.parent
    try:
        _open_path(open_target)
    except Exception as e:
        raise HTTPException(500, f"failed to open artifact: {e}")

    return {"ok": True, "opened": str(open_target)}
