import json
import os
from pathlib import Path

import yaml
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"
SETTINGS_FILE = Path(__file__).parent.parent / "data" / "llm_settings.json"

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
}

PROVIDER_LABELS = {
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "openrouter": "OpenRouter",
}


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


class SettingsResponse(BaseModel):
    api_keys: ApiKeys
    workflow_settings: dict[str, WorkflowSetting]
    model_options: dict[str, list[str]]
    providers: dict[str, str]
    workflows: list[WorkflowOption]


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


def save_settings(payload: SettingsPayload):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(payload.model_dump_json(indent=2), encoding="utf-8")


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

    return SettingsResponse(
        api_keys=loaded["api_keys"],
        workflow_settings=loaded["workflow_settings"],
        model_options=DEFAULT_MODELS,
        providers=PROVIDER_LABELS,
        workflows=workflows,
    )


@router.put("")
def update_settings(body: SettingsPayload):
    save_settings(body)
    return get_settings()
