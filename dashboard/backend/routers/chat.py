import json
import os
from pathlib import Path
from datetime import datetime
from typing import AsyncIterator

import anthropic
from openai import OpenAI
import yaml
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from routers.settings import load_settings

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    workflow_id: str
    messages: list[Message]
    save: bool = True


def load_workflow(workflow_id: str) -> dict:
    path = WORKFLOWS_DIR / f"{workflow_id}.yaml"
    if not path.exists():
        raise HTTPException(404, f"Workflow '{workflow_id}' not found")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def resolve_runtime_config(workflow: dict) -> tuple[str, str, str]:
    settings = load_settings()
    workflow_id = workflow.get("id", "")
    saved = settings.get("workflow_settings", {}).get(workflow_id, {})

    provider = saved.get("provider") or workflow.get("provider", "anthropic")
    model = saved.get("model") or workflow.get("model", "claude-opus-4-7")
    api_keys = settings.get("api_keys", {})

    api_key = ""
    if provider == "anthropic":
        api_key = api_keys.get("anthropic") or os.environ.get("ANTHROPIC_API_KEY", "")
    elif provider == "openai":
        api_key = api_keys.get("openai") or os.environ.get("OPENAI_API_KEY", "")
    elif provider == "openrouter":
        api_key = api_keys.get("openrouter") or os.environ.get("OPENROUTER_API_KEY", "")
    else:
        raise HTTPException(400, f"Unsupported provider '{provider}'")

    if not api_key:
        raise HTTPException(400, f"Missing API key for provider '{provider}'")

    return provider, model, api_key


async def stream_anthropic(api_key: str, model: str, system: str, api_messages: list[dict]) -> AsyncIterator[str]:
    client = anthropic.Anthropic(api_key=api_key)
    with client.messages.stream(
        model=model,
        max_tokens=8096,
        system=system,
        messages=api_messages,
    ) as stream:
        for text in stream.text_stream:
            yield text


async def stream_openai_compatible(provider: str, api_key: str, model: str, system: str, api_messages: list[dict]) -> AsyncIterator[str]:
    base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else None
    client = OpenAI(api_key=api_key, base_url=base_url)

    openai_messages = [{"role": "system", "content": system}] + api_messages
    stream = client.chat.completions.create(
        model=model,
        messages=openai_messages,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


async def stream_response(workflow: dict, messages: list[Message], save: bool) -> AsyncIterator[str]:
    provider, model, api_key = resolve_runtime_config(workflow)
    system = workflow.get("system_prompt", "You are a helpful assistant.")

    api_messages = [{"role": m.role, "content": m.content} for m in messages]

    full_response = ""

    if provider == "anthropic":
        text_stream = stream_anthropic(api_key, model, system, api_messages)
    else:
        text_stream = stream_openai_compatible(provider, api_key, model, system, api_messages)

    async for text in text_stream:
        full_response += text
        yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"

    # Auto-save if enabled and this is a meaningful response
    if save and full_response.strip():
        output_folder = workflow.get("output_folder", "shared/artifacts")
        output_dir = ROOT / output_folder
        output_dir.mkdir(parents=True, exist_ok=True)

        slug = workflow.get("id", "output")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        save_extension = str(workflow.get("save_extension", ".md"))
        if not save_extension.startswith("."):
            save_extension = f".{save_extension}"
        filename = f"{slug}_{timestamp}{save_extension}"
        filepath = output_dir / filename

        if save_extension.lower() == ".txt":
            filepath.write_text(full_response, encoding="utf-8")
        else:
            # Build full conversation for markdown archives.
            doc_parts = [f"# {workflow.get('name', slug)}\n", f"*Saved: {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n"]
            for msg in messages:
                role_label = "**You**" if msg.role == "user" else "**Assistant**"
                doc_parts.append(f"{role_label}\n\n{msg.content}\n\n---\n\n")
            doc_parts.append(f"**Assistant**\n\n{full_response}\n")
            filepath.write_text("".join(doc_parts), encoding="utf-8")

        try:
            from routers.media import record_event
            record_event("workflow_save", {
                "workflow_id": workflow.get("id", ""),
                "workflow_name": workflow.get("name", ""),
                "saved_path": str(filepath.relative_to(ROOT)),
            })
        except Exception:
            # Never block chat streaming if event logging fails.
            pass

        yield f"data: {json.dumps({'type': 'saved', 'path': str(filepath.relative_to(ROOT))})}\n\n"

    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    workflow = load_workflow(req.workflow_id)
    return StreamingResponse(
        stream_response(workflow, req.messages, req.save),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
