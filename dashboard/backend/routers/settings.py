import json
import os
from pathlib import Path

import httpx
import yaml
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"
SETTINGS_FILE = Path(__file__).parent.parent / "data" / "llm_settings.json"

OLLAMA_BASE_URL = "http://localhost:11434/v1"

DEFAULT_MODELS = {
    "anthropic": [
        "claude-opus-4-7",
        "claude-sonnet-4-5",
        "claude-3-7-sonnet-latest",
    ],
    "openai": [
        "gpt-5",
        "gpt-5-mini",
        "gpt-4.1",
        "gpt-4o",
    ],
    "openrouter": [
        "anthropic/claude-3.7-sonnet",
        "openai/gpt-4o-mini",
        "google/gemini-2.5-flash-preview",
        "deepseek/deepseek-chat-v3-0324",
    ],
    "ollama": [],
}

PROVIDER_LABELS = {
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "openrouter": "OpenRouter",
    "ollama": "Ollama (Local)",
}


def get_ollama_status() -> dict:
    """Check if Ollama is running and return available models."""
    try:
        resp = httpx.get(f"{OLLAMA_BASE_URL}/models", timeout=2)
        resp.raise_for_status()
        models = [m["id"] for m in resp.json().get("data", [])]
        return {"running": True, "models": models}
    except Exception:
        return {"running": False, "models": []}


class WorkflowSetting(BaseModel):
    provider: str
    model: str


class ApiKeys(BaseModel):
    anthropic: str = ""
    openai: str = ""
    openrouter: str = ""


class SettingsPayload(BaseModel):
    api_keys: ApiKeys
    workflow_settings: dict[str, WorkflowSetting] = Field(default_factory=dict)


class WorkflowOption(BaseModel):
    id: str
    name: str
    default_provider: str
    default_model: str


class OllamaStatus(BaseModel):
    running: bool
    models: list[str]


class SettingsResponse(BaseModel):
    api_keys: ApiKeys
    workflow_settings: dict[str, WorkflowSetting]
    model_options: dict[str, list[str]]
    providers: dict[str, str]
    workflows: list[WorkflowOption]
    ollama: OllamaStatus


def workflow_defaults() -> dict[str, dict]:
    defaults = {}
    for path in sorted(WORKFLOWS_DIR.glob("*.yaml")):
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        workflow_id = data.get("id", path.stem)
        defaults[workflow_id] = {
            "id": workflow_id,
            "name": data.get("name", workflow_id),
            "provider": data.get("provider", "anthropic"),
            "model": data.get("model", DEFAULT_MODELS["anthropic"][0]),
        }
    return defaults


def load_settings() -> dict:
    defaults = workflow_defaults()
    base = {
        "api_keys": {
            "anthropic": os.environ.get("ANTHROPIC_API_KEY", ""),
            "openai": os.environ.get("OPENAI_API_KEY", ""),
            "openrouter": os.environ.get("OPENROUTER_API_KEY", ""),
        },
        "workflow_settings": {
            workflow_id: {
                "provider": info["provider"],
                "model": info["model"],
            }
            for workflow_id, info in defaults.items()
        },
    }

    if SETTINGS_FILE.exists():
        saved = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        base["api_keys"].update(saved.get("api_keys", {}))
        for workflow_id, setting in saved.get("workflow_settings", {}).items():
            if workflow_id in base["workflow_settings"]:
                base["workflow_settings"][workflow_id].update(setting)
            else:
                base["workflow_settings"][workflow_id] = setting

    return base


ENV_FILE = ROOT / ".env"

ENV_KEY_MAP = {
    "anthropic":  "ANTHROPIC_API_KEY",
    "openai":     "OPENAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}


def _update_env_file(api_keys: ApiKeys):
    """Write non-empty API keys into the root .env file, preserving other lines."""
    lines: list[str] = []
    if ENV_FILE.exists():
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines()

    updates = {
        env_var: getattr(api_keys, field)
        for field, env_var in ENV_KEY_MAP.items()
        if getattr(api_keys, field)
    }

    # Replace existing lines for keys we're updating
    existing_keys = set()
    new_lines = []
    for line in lines:
        matched = False
        for env_var in updates:
            if line.startswith(f"{env_var}="):
                new_lines.append(f"{env_var}={updates[env_var]}")
                existing_keys.add(env_var)
                matched = True
                break
        if not matched:
            new_lines.append(line)

    # Append any keys not already in the file
    for env_var, value in updates.items():
        if env_var not in existing_keys:
            new_lines.append(f"{env_var}={value}")

    ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

    # Also set them in the current process so they're available immediately
    for env_var, value in updates.items():
        os.environ[env_var] = value


def save_settings(payload: SettingsPayload):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    _update_env_file(payload.api_keys)


@router.get("")
def get_settings():
    loaded = load_settings()
    defaults = workflow_defaults()
    workflows = [
        {
            "id": workflow_id,
            "name": info["name"],
            "default_provider": info["provider"],
            "default_model": info["model"],
        }
        for workflow_id, info in defaults.items()
    ]

    ollama = get_ollama_status()
    model_options = {**DEFAULT_MODELS, "ollama": ollama["models"]}

    return SettingsResponse(
        api_keys=loaded["api_keys"],
        workflow_settings=loaded["workflow_settings"],
        model_options=model_options,
        providers=PROVIDER_LABELS,
        workflows=workflows,
        ollama=OllamaStatus(**ollama),
    )


@router.put("")
def update_settings(body: SettingsPayload):
    save_settings(body)
    return get_settings()
