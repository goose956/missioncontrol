import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
IDEAS_FILE = ROOT / "workspaces" / "ideas" / "ideas.json"

CATEGORIES = ["saas", "skill", "landing-page", "ad-ideas", "misc"]
STATUSES = ["draft", "working", "complete", "archived"]


def load_ideas() -> list:
    if not IDEAS_FILE.exists():
        return []
    return json.loads(IDEAS_FILE.read_text(encoding="utf-8"))


def save_ideas(ideas: list):
    IDEAS_FILE.parent.mkdir(parents=True, exist_ok=True)
    IDEAS_FILE.write_text(json.dumps(ideas, indent=2, ensure_ascii=True), encoding="utf-8")


class IdeaCreate(BaseModel):
    title: str
    category: str
    description: str
    status: str = "draft"


class IdeaUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class RewriteRequest(BaseModel):
    description: str
    category: str


@router.get("")
def list_ideas():
    ideas = load_ideas()
    return sorted(ideas, key=lambda x: x.get("rank", 9999))


@router.post("")
def create_idea(body: IdeaCreate):
    ideas = load_ideas()
    new_idea = {
        "id": str(uuid.uuid4()),
        "rank": len(ideas) + 1,
        "title": body.title,
        "category": body.category,
        "description": body.description,
        "status": body.status,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    ideas.append(new_idea)
    save_ideas(ideas)
    return new_idea


@router.put("/{idea_id}")
def update_idea(idea_id: str, body: IdeaUpdate):
    ideas = load_ideas()
    for idea in ideas:
        if idea["id"] == idea_id:
            if body.title is not None:
                idea["title"] = body.title
            if body.category is not None:
                idea["category"] = body.category
            if body.description is not None:
                idea["description"] = body.description
            if body.status is not None:
                idea["status"] = body.status
            idea["updated_at"] = datetime.now().isoformat()
            save_ideas(ideas)
            return idea
    raise HTTPException(404, "Idea not found")


@router.delete("/{idea_id}")
def delete_idea(idea_id: str):
    ideas = load_ideas()
    ideas = [i for i in ideas if i["id"] != idea_id]
    # Re-rank sequentially
    for i, idea in enumerate(sorted(ideas, key=lambda x: x.get("rank", 9999)), 1):
        idea["rank"] = i
    save_ideas(ideas)
    return {"ok": True}


@router.post("/reorder")
def reorder_ideas(ids: List[str]):
    ideas = load_ideas()
    id_map = {i["id"]: i for i in ideas}
    for rank, idea_id in enumerate(ids, 1):
        if idea_id in id_map:
            id_map[idea_id]["rank"] = rank
    save_ideas(list(id_map.values()))
    return {"ok": True}


@router.post("/rewrite")
async def rewrite_idea(body: RewriteRequest):
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    category_labels = {
        "saas": "SaaS product",
        "skill": "Claude Code / AI skill",
        "landing-page": "landing page",
        "ad-ideas": "advertising / marketing idea",
        "misc": "general idea",
    }
    label = category_labels.get(body.category, body.category)

    prompt = f"""You are helping a founder sharpen their ideas. Rewrite the following {label} idea into a compelling 2-3 sentence description. Be specific, punchy, and clear about the value proposition. No fluff, no preamble — just the improved description.

Original idea:
{body.description}"""

    async def stream():
        with client.messages.stream(
            model="claude-opus-4-7",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        ) as s:
            for text in s.text_stream:
                yield f"data: {json.dumps({'type': 'text', 'text': text}, ensure_ascii=True)}\n\n"
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=True)}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
