import os
import json
import asyncio
from pathlib import Path
from datetime import datetime
from typing import AsyncIterator

import anthropic
import yaml
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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


async def stream_response(workflow: dict, messages: list[Message], save: bool) -> AsyncIterator[str]:
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    model = workflow.get("model", "claude-opus-4-7")
    system = workflow.get("system_prompt", "You are a helpful assistant.")

    api_messages = [{"role": m.role, "content": m.content} for m in messages]

    full_response = ""

    with client.messages.stream(
        model=model,
        max_tokens=8096,
        system=system,
        messages=api_messages,
    ) as stream:
        for text in stream.text_stream:
            full_response += text
            yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"

    # Auto-save if enabled and this is a meaningful response
    if save and full_response.strip():
        output_folder = workflow.get("output_folder", "shared/artifacts")
        output_dir = ROOT / output_folder
        output_dir.mkdir(parents=True, exist_ok=True)

        slug = workflow.get("id", "output")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{slug}_{timestamp}.md"
        filepath = output_dir / filename

        # Build full conversation for the saved file
        doc_parts = [f"# {workflow.get('name', slug)}\n", f"*Saved: {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n"]
        for msg in messages:
            role_label = "**You**" if msg.role == "user" else "**Assistant**"
            doc_parts.append(f"{role_label}\n\n{msg.content}\n\n---\n\n")
        doc_parts.append(f"**Assistant**\n\n{full_response}\n")

        filepath.write_text("".join(doc_parts), encoding="utf-8")
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
