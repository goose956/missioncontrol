import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from openai import OpenAI
from pydantic import BaseModel

from routers.settings import load_settings

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
DATA_FILE = ROOT / "workspaces" / "landing-pages" / "landing_pages.json"

STEP_DEFAULTS = [
    {"type": "LANDING", "order": 1, "name": "Landing Page"},
    {"type": "UPSELL", "order": 2, "name": "Upsell Page"},
    {"type": "THANKS", "order": 3, "name": "Thank You Page"},
]

STEP_CONTEXT = {
    "LANDING": "Create a high-converting landing page with hero, benefits, social proof, and strong CTA.",
    "UPSELL": "Create an upsell page for post-purchase offer with urgency and clear accept/decline actions.",
    "THANKS": "Create a thank-you page that confirms success and sets clear next steps.",
}

SYSTEM_PROMPT = """You are an elite conversion-focused web designer and front-end developer.
Return only a full HTML document (no markdown fences, no explanation).
Use Tailwind CDN: <script src=\"https://cdn.tailwindcss.com\"></script>
Ensure mobile + desktop friendly layout and explicit text colors for readability.
Every major section must have id attributes (hero, features, testimonials, cta, footer as relevant).
Use realistic marketing copy based on the user prompt.
"""


class FunnelCreate(BaseModel):
    name: str
    description: str = ""


class FunnelUpdate(BaseModel):
    name: str
    description: str = ""


class StepToggle(BaseModel):
    enabled: bool


class GenerateRequest(BaseModel):
    step_id: str
    prompt: str
    collect_emails: bool = False


class EditRequest(BaseModel):
    step_id: str
    edit_prompt: str


class PageSettingsUpdate(BaseModel):
    slug: Optional[str] = None
    collect_emails: Optional[bool] = None
    stripe_payment_link: Optional[str] = None
    stripe_button_text: Optional[str] = None


class SignupRequest(BaseModel):
    page_id: str
    email: str
    name: Optional[str] = None


def now_iso() -> str:
    return datetime.now().isoformat()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9-]", "-", value.strip().lower()).strip("-")


def load_db() -> dict:
    if not DATA_FILE.exists():
        return {"funnels": []}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_db(data: dict):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def find_funnel(db: dict, funnel_id: str) -> dict:
    for funnel in db["funnels"]:
        if funnel["id"] == funnel_id:
            return funnel
    raise HTTPException(404, "Funnel not found")


def find_step(db: dict, step_id: str) -> tuple[dict, dict]:
    for funnel in db["funnels"]:
        for step in funnel["steps"]:
            if step["id"] == step_id:
                return funnel, step
    raise HTTPException(404, "Step not found")


def find_page(db: dict, page_id: str) -> tuple[dict, dict, dict]:
    for funnel in db["funnels"]:
        for step in funnel["steps"]:
            page = step.get("page")
            if page and page["id"] == page_id:
                return funnel, step, page
    raise HTTPException(404, "Page not found")


def all_pages(db: dict) -> list[dict]:
    pages = []
    for funnel in db["funnels"]:
        for step in funnel["steps"]:
            page = step.get("page")
            if page:
                pages.append(page)
    return pages


def choose_provider_model() -> tuple[str, str, str]:
    settings = load_settings()
    wf = settings.get("workflow_settings", {}).get("coder") or {}
    provider = wf.get("provider", "anthropic")
    model = wf.get("model", "claude-opus-4-7")

    api_keys = settings.get("api_keys", {})
    if provider == "anthropic":
        key = api_keys.get("anthropic", "")
        if not key:
            raise HTTPException(400, "Missing Anthropic API key in Settings")
    elif provider == "openai":
        key = api_keys.get("openai", "")
        if not key:
            raise HTTPException(400, "Missing OpenAI API key in Settings")
    elif provider == "openrouter":
        key = api_keys.get("openrouter", "")
        if not key:
            raise HTTPException(400, "Missing OpenRouter API key in Settings")
    else:
        raise HTTPException(400, f"Unsupported provider '{provider}'")

    return provider, model, key


def llm_generate(prompt: str) -> str:
    provider, model, api_key = choose_provider_model()

    if provider == "anthropic":
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        text_blocks = [block.text for block in response.content if getattr(block, "type", None) == "text"]
        return "\n".join(text_blocks).strip()

    base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else None
    client = OpenAI(api_key=api_key, base_url=base_url)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return (response.choices[0].message.content or "").strip()


def ensure_html_doc(html: str) -> str:
    cleaned = html.strip()
    if cleaned.lower().startswith("<!doctype html"):
        return cleaned
    return f"<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\" /></head><body>{cleaned}</body></html>"


def public_step_view(step: dict) -> dict:
    return {
        "id": step["id"],
        "funnel_id": step["funnel_id"],
        "type": step["type"],
        "order": step["order"],
        "name": step["name"],
        "enabled": step["enabled"],
        "page": step.get("page"),
    }


def public_funnel_view(funnel: dict) -> dict:
    return {
        "id": funnel["id"],
        "name": funnel["name"],
        "description": funnel.get("description", ""),
        "created_at": funnel["created_at"],
        "updated_at": funnel["updated_at"],
        "steps": [public_step_view(step) for step in sorted(funnel["steps"], key=lambda s: s["order"])],
    }


@router.get("/funnels")
def list_funnels():
    db = load_db()
    items = sorted(db["funnels"], key=lambda f: f["created_at"], reverse=True)
    return [public_funnel_view(item) for item in items]


@router.get("/funnels/{funnel_id}")
def get_funnel(funnel_id: str):
    db = load_db()
    funnel = find_funnel(db, funnel_id)
    return public_funnel_view(funnel)


@router.post("/funnels")
def create_funnel(body: FunnelCreate):
    if not body.name.strip():
        raise HTTPException(400, "Funnel name is required")
    db = load_db()
    now = now_iso()
    funnel_id = str(uuid.uuid4())

    steps = []
    for step in STEP_DEFAULTS:
        step_id = str(uuid.uuid4())
        page_id = str(uuid.uuid4())
        steps.append(
            {
                "id": step_id,
                "funnel_id": funnel_id,
                "type": step["type"],
                "order": step["order"],
                "name": step["name"],
                "enabled": True,
                "page": {
                    "id": page_id,
                    "step_id": step_id,
                    "html_content": None,
                    "prompt_history": [],
                    "slug": None,
                    "collect_emails": False,
                    "stripe_payment_link": None,
                    "stripe_button_text": None,
                    "views": [],
                    "signups": [],
                    "created_at": now,
                    "updated_at": now,
                },
            }
        )

    funnel = {
        "id": funnel_id,
        "name": body.name.strip(),
        "description": body.description.strip(),
        "created_at": now,
        "updated_at": now,
        "steps": steps,
    }
    db["funnels"].append(funnel)
    save_db(db)
    return public_funnel_view(funnel)


@router.put("/funnels/{funnel_id}")
def update_funnel(funnel_id: str, body: FunnelUpdate):
    if not body.name.strip():
        raise HTTPException(400, "Funnel name is required")
    db = load_db()
    funnel = find_funnel(db, funnel_id)
    funnel["name"] = body.name.strip()
    funnel["description"] = body.description.strip()
    funnel["updated_at"] = now_iso()
    save_db(db)
    return public_funnel_view(funnel)


@router.delete("/funnels/{funnel_id}")
def delete_funnel(funnel_id: str):
    db = load_db()
    before = len(db["funnels"])
    db["funnels"] = [f for f in db["funnels"] if f["id"] != funnel_id]
    if len(db["funnels"]) == before:
        raise HTTPException(404, "Funnel not found")
    save_db(db)
    return {"ok": True}


@router.patch("/funnels/{funnel_id}/steps/{step_id}")
def toggle_step(funnel_id: str, step_id: str, body: StepToggle):
    db = load_db()
    funnel = find_funnel(db, funnel_id)
    for step in funnel["steps"]:
        if step["id"] == step_id:
            step["enabled"] = body.enabled
            funnel["updated_at"] = now_iso()
            save_db(db)
            return public_step_view(step)
    raise HTTPException(404, "Step not found")


@router.get("/pages/{step_id}")
def get_page(step_id: str):
    db = load_db()
    _, step = find_step(db, step_id)
    page = step.get("page")
    if not page:
        raise HTTPException(404, "Page not found")
    return page


@router.post("/pages/generate")
def generate_page(body: GenerateRequest):
    if not body.prompt.strip():
        raise HTTPException(400, "Prompt is required")

    db = load_db()
    funnel, step = find_step(db, body.step_id)
    page = step.get("page")
    if not page:
        raise HTTPException(404, "Page not found")

    context = STEP_CONTEXT.get(step["type"], "Create a high-converting marketing page.")
    user_prompt = f"Step type: {step['type']}\nContext: {context}\n\nUser request:\n{body.prompt.strip()}"
    html = ensure_html_doc(llm_generate(user_prompt))

    page["html_content"] = html
    page["collect_emails"] = body.collect_emails
    page["updated_at"] = now_iso()
    page["prompt_history"] = [
        {
            "role": "user",
            "type": "generate",
            "content": body.prompt.strip(),
            "timestamp": now_iso(),
        }
    ]
    if not page.get("slug"):
        page["slug"] = slugify(f"{funnel['name']}-{step['type']}-{uuid.uuid4().hex[:6]}")

    funnel["updated_at"] = now_iso()
    save_db(db)
    return page


@router.post("/pages/edit")
def edit_page(body: EditRequest):
    if not body.edit_prompt.strip():
        raise HTTPException(400, "Edit prompt is required")

    db = load_db()
    funnel, step = find_step(db, body.step_id)
    page = step.get("page")
    if not page:
        raise HTTPException(404, "Page not found")
    if not page.get("html_content"):
        raise HTTPException(400, "No page generated yet")

    prompt = (
        f"Edit this HTML page according to the request. Return only full HTML.\n\n"
        f"Current HTML:\n{page['html_content']}\n\n"
        f"Edit request:\n{body.edit_prompt.strip()}"
    )
    html = ensure_html_doc(llm_generate(prompt))
    page["html_content"] = html
    page["updated_at"] = now_iso()
    history = page.get("prompt_history") or []
    history.append(
        {
            "role": "user",
            "type": "edit",
            "content": body.edit_prompt.strip(),
            "timestamp": now_iso(),
        }
    )
    page["prompt_history"] = history

    funnel["updated_at"] = now_iso()
    save_db(db)
    return page


@router.patch("/pages/{step_id}/settings")
def update_page_settings(step_id: str, body: PageSettingsUpdate):
    db = load_db()
    funnel, step = find_step(db, step_id)
    page = step.get("page")
    if not page:
        raise HTTPException(404, "Page not found")

    if body.slug is not None:
        candidate = slugify(body.slug)
        if not candidate:
            raise HTTPException(400, "Invalid slug")
        existing = [p for p in all_pages(db) if p.get("slug") == candidate and p.get("id") != page.get("id")]
        if existing:
            raise HTTPException(409, "Slug already in use")
        page["slug"] = candidate

    if body.collect_emails is not None:
        page["collect_emails"] = body.collect_emails
    if body.stripe_payment_link is not None:
        page["stripe_payment_link"] = body.stripe_payment_link or None
    if body.stripe_button_text is not None:
        page["stripe_button_text"] = body.stripe_button_text or None

    page["updated_at"] = now_iso()
    funnel["updated_at"] = now_iso()
    save_db(db)
    return page


@router.get("/analytics/{page_id}")
def get_analytics(page_id: str):
    db = load_db()
    _, _, page = find_page(db, page_id)
    return {
        "view_count": len(page.get("views") or []),
        "signups": page.get("signups") or [],
    }


@router.get("/public/{slug}")
def render_public(slug: str):
    db = load_db()
    matched_page = None
    for page in all_pages(db):
        if page.get("slug") == slug:
            matched_page = page
            break

    if not matched_page or not matched_page.get("html_content"):
        raise HTTPException(404, "Page not found")

    html = matched_page["html_content"]
    views = matched_page.get("views") or []
    views.append({"viewed_at": now_iso()})
    matched_page["views"] = views

    if matched_page.get("collect_emails"):
        signup_script = f"""
<script>
(function() {{
  var pageId = {json.dumps(matched_page['id'])};
  function validEmail(email) {{ return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(email); }}
  function hookForms() {{
    document.querySelectorAll('form').forEach(function(form) {{
      if (form.__mcHooked) return;
      form.__mcHooked = true;
      form.addEventListener('submit', function(e) {{
        var emailInput = form.querySelector('input[type="email"], input[name="email"]');
        if (!emailInput || !validEmail(emailInput.value || '')) return;
        e.preventDefault();
        fetch('/api/landing-pages/public/signup', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ page_id: pageId, email: emailInput.value, name: (form.querySelector('input[name="name"]') || {{}}).value || '' }})
        }}).then(function() {{
          form.innerHTML = '<div style="padding:1rem;text-align:center">Thanks! You are on the list.</div>';
        }}).catch(function() {{ form.submit(); }});
      }});
    }});
  }}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookForms); else hookForms();
}})();
</script>
"""
        if "</body>" in html:
            html = html.replace("</body>", signup_script + "\n</body>")
        else:
            html += signup_script

    if matched_page.get("stripe_payment_link"):
        text = matched_page.get("stripe_button_text") or "Buy Now"
        stripe_html = f"""
<div style=\"position:fixed;right:20px;bottom:20px;z-index:9999\">
  <a href=\"{matched_page['stripe_payment_link']}\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"display:inline-block;padding:12px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-family:system-ui\">{text}</a>
</div>
"""
        if "</body>" in html:
            html = html.replace("</body>", stripe_html + "\n</body>")
        else:
            html += stripe_html

    save_db(db)
    return HTMLResponse(html)


@router.post("/public/signup")
def create_signup(body: SignupRequest):
    if not body.page_id:
        raise HTTPException(400, "page_id is required")
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", body.email or ""):
        raise HTTPException(400, "Valid email is required")

    db = load_db()
    _, _, page = find_page(db, body.page_id)
    if not page.get("collect_emails"):
        raise HTTPException(403, "Signups disabled for this page")

    signups = page.get("signups") or []
    signups.append(
        {
            "email": body.email.strip().lower(),
            "name": (body.name or "").strip() or None,
            "created_at": now_iso(),
        }
    )
    page["signups"] = signups
    save_db(db)
    return {"ok": True}
