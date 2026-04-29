import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import anthropic
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from openai import OpenAI
from pydantic import BaseModel

from routers.settings import load_settings

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
DATA_FILE = ROOT / "workspaces" / "landing-pages" / "landing_pages.json"
CONTACTS_FILE = ROOT / "workspaces" / "landing-pages" / "contacts.json"

STEP_DEFAULTS = [
    {"type": "LANDING", "order": 1, "name": "Landing Page"},
    {"type": "UPSELL", "order": 2, "name": "Upsell Page"},
    {"type": "THANKS", "order": 3, "name": "Thank You Page"},
]

STEP_CONTEXT = {
    "LANDING": {
        "label": "Landing Page",
        "purpose": "This is the first page visitors see. Its goal is to capture attention, convey a compelling value proposition, and drive the visitor to take action (sign up, buy, click a CTA). It should have a strong hero section, benefits, social proof, and a clear call-to-action.",
    },
    "UPSELL": {
        "label": "Upsell Page",
        "purpose": "This page is shown after the visitor has already taken an initial action. Its goal is to offer a premium upgrade or complementary product. It should feel celebratory, exclusive, and create urgency. Include a strong offer headline, what they get, and two options: accept the offer or decline.",
    },
    "THANKS": {
        "label": "Thank You Page",
        "purpose": "This page confirms the visitor completed an action (purchase, signup). Its goal is to delight the user, reinforce their decision, set expectations for next steps, and optionally upsell a secondary item or share links. Keep it warm, confirming, and valuable.",
    },
}

SYSTEM_PROMPT = """You are an elite web designer and front-end developer specializing in high-converting marketing pages. You produce stunning, professional landing pages that look like they were built by a top-tier agency.

RULES:
1. Return ONLY a complete, valid HTML document. No markdown, no code fences, no explanation — just raw HTML starting with <!DOCTYPE html>.
2. Always include the Tailwind CSS CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Always include a Google Fonts link for beautiful typography (e.g. Inter, Plus Jakarta Sans). Apply the font to the body using an inline style attribute.
4. Use inline <style> blocks for any custom CSS (gradients, animations, etc.) not covered by Tailwind.
5. Design with a mobile-first approach. The page must look great on both desktop and mobile.
6. Use vivid, professional design: bold hero typography, rich gradient backgrounds or dark themes where appropriate, beautiful card components, clear hierarchy, strong CTAs.
7. Include placeholder images using https://picsum.photos (e.g. https://picsum.photos/seed/hero/1200/600) or CSS gradient backgrounds instead of broken image links.
8. Make it feel REAL — include realistic placeholder text relevant to the user's described business/product.
9. CTA buttons must be visually prominent — large, high-contrast, with hover effects.
10. No external JS libraries beyond Tailwind CDN. Vanilla JS only if needed for interactions.
11. CRITICAL — Text visibility: Every headline, subheadline, and paragraph MUST be clearly readable. Never place light text on a light background or dark text on a dark background. Always set explicit text colors on every element.
12. CRITICAL — Hero headline: The main H1 must always be at minimum text-4xl md:text-6xl, font-extrabold, and have an explicit text color. Never omit the color.
13. Always set an explicit background-color on the <body> tag so the page never renders with a transparent background.
14. CRITICAL — Follow quantity instructions exactly: If the user asks for "3 testimonials", include exactly 3 distinct testimonials.
15. CRITICAL — Complete all edits fully. Never partially apply an edit or leave placeholder comments.
16. CRITICAL — Section IDs: Every major section (hero, features, benefits, testimonials, pricing, faq, cta, footer, nav) MUST have a unique id attribute matching its purpose.
17. CRITICAL — Anchor links only: Every link on the page MUST use in-page anchor hrefs (e.g. href="#features"). NEVER link to other pages or paths. Add smooth scrolling: <style>html { scroll-behavior: smooth; }</style>"""

TEMPLATES = {
    "LANDING": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BRAND_NAME</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>html { scroll-behavior: smooth; }</style>
</head>
<body style="font-family:'Inter',sans-serif; background:#0f0f1a; color:#f1f1f3;">
  <nav id="nav" class="sticky top-0 z-50 bg-black/80 backdrop-blur border-b border-white/10">
    <div class="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
      <span class="text-white font-bold text-xl">BRAND_NAME</span>
      <div class="hidden md:flex items-center gap-6">
        <a href="#features" class="text-white/60 hover:text-white text-sm transition">Features</a>
        <a href="#testimonials" class="text-white/60 hover:text-white text-sm transition">Reviews</a>
        <a href="#faq" class="text-white/60 hover:text-white text-sm transition">FAQ</a>
      </div>
      <a href="#cta" class="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition">CTA_TEXT</a>
    </div>
  </nav>
  <section id="hero" class="py-20 sm:py-32 text-center">
    <div class="max-w-4xl mx-auto px-4 sm:px-8">
      <p class="text-violet-400 uppercase tracking-widest text-sm font-semibold mb-4">EYEBROW_TEXT</p>
      <h1 class="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white leading-tight mb-6">MAIN_HEADLINE</h1>
      <p class="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-10">SUBHEADLINE</p>
      <a href="#cta" class="inline-block px-8 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-lg rounded-2xl hover:opacity-90 transition shadow-xl">PRIMARY_CTA</a>
    </div>
  </section>
  <section id="logos" class="py-12 border-y border-white/5">
    <div class="max-w-4xl mx-auto px-4 sm:px-8 text-center">
      <p class="text-white/30 text-sm uppercase tracking-widest mb-8">Trusted by teams at</p>
      <div class="flex flex-wrap items-center justify-center gap-8 opacity-50">
        <span class="text-white font-bold text-lg">COMPANY_1</span>
        <span class="text-white font-bold text-lg">COMPANY_2</span>
        <span class="text-white font-bold text-lg">COMPANY_3</span>
        <span class="text-white font-bold text-lg">COMPANY_4</span>
      </div>
    </div>
  </section>
  <section id="features" class="py-20 sm:py-28">
    <div class="max-w-6xl mx-auto px-4 sm:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-white mb-4">FEATURES_HEADLINE</h2>
        <p class="text-white/50 max-w-xl mx-auto">FEATURES_SUBHEADLINE</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><h3 class="text-white font-bold text-lg mb-2">FEATURE_1_TITLE</h3><p class="text-white/50 text-sm leading-relaxed">FEATURE_1_DESC</p></div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><h3 class="text-white font-bold text-lg mb-2">FEATURE_2_TITLE</h3><p class="text-white/50 text-sm leading-relaxed">FEATURE_2_DESC</p></div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><h3 class="text-white font-bold text-lg mb-2">FEATURE_3_TITLE</h3><p class="text-white/50 text-sm leading-relaxed">FEATURE_3_DESC</p></div>
      </div>
    </div>
  </section>
  <section id="testimonials" class="py-20 sm:py-28 bg-white/[0.02]">
    <div class="max-w-6xl mx-auto px-4 sm:px-8">
      <h2 class="text-3xl sm:text-4xl font-extrabold text-white text-center mb-14">What Our Customers Say</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><p class="text-white/70 text-sm leading-relaxed mb-4">"TESTIMONIAL_1_QUOTE"</p><p class="text-white font-semibold text-sm">TESTIMONIAL_1_NAME</p><p class="text-white/40 text-xs">TESTIMONIAL_1_ROLE</p></div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><p class="text-white/70 text-sm leading-relaxed mb-4">"TESTIMONIAL_2_QUOTE"</p><p class="text-white font-semibold text-sm">TESTIMONIAL_2_NAME</p><p class="text-white/40 text-xs">TESTIMONIAL_2_ROLE</p></div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><p class="text-white/70 text-sm leading-relaxed mb-4">"TESTIMONIAL_3_QUOTE"</p><p class="text-white font-semibold text-sm">TESTIMONIAL_3_NAME</p><p class="text-white/40 text-xs">TESTIMONIAL_3_ROLE</p></div>
      </div>
    </div>
  </section>
  <section id="faq" class="py-20 sm:py-28">
    <div class="max-w-3xl mx-auto px-4 sm:px-8">
      <h2 class="text-3xl sm:text-4xl font-extrabold text-white text-center mb-12">Frequently Asked Questions</h2>
      <div class="space-y-4">
        <details class="rounded-xl border border-white/10 bg-white/5 px-5 py-4"><summary class="text-white font-semibold cursor-pointer list-none">FAQ_Q1</summary><p class="text-white/50 text-sm mt-3">FAQ_A1</p></details>
        <details class="rounded-xl border border-white/10 bg-white/5 px-5 py-4"><summary class="text-white font-semibold cursor-pointer list-none">FAQ_Q2</summary><p class="text-white/50 text-sm mt-3">FAQ_A2</p></details>
        <details class="rounded-xl border border-white/10 bg-white/5 px-5 py-4"><summary class="text-white font-semibold cursor-pointer list-none">FAQ_Q3</summary><p class="text-white/50 text-sm mt-3">FAQ_A3</p></details>
      </div>
    </div>
  </section>
  <section id="cta" class="py-20 sm:py-32 text-center">
    <div class="max-w-3xl mx-auto px-4 sm:px-8">
      <h2 class="text-3xl sm:text-5xl font-extrabold text-white mb-6">FINAL_CTA_HEADLINE</h2>
      <p class="text-white/60 text-lg mb-10">FINAL_CTA_SUBTEXT</p>
      <a href="#" class="inline-block px-10 py-5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-xl rounded-2xl hover:opacity-90 transition shadow-2xl">FINAL_CTA_BUTTON</a>
    </div>
  </section>
  <footer id="footer" class="border-t border-white/5 py-10 text-center">
    <p class="text-white/30 text-sm">© 2025 BRAND_NAME. All rights reserved.</p>
  </footer>
</body>
</html>""",

    "UPSELL": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Special Offer — BRAND_NAME</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>html { scroll-behavior: smooth; }</style>
</head>
<body style="font-family:'Inter',sans-serif; background:#0f0f1a; color:#f1f1f3;">
  <section id="hero" class="py-16 sm:py-24 text-center">
    <div class="max-w-3xl mx-auto px-4 sm:px-8">
      <p class="text-amber-400 uppercase tracking-widest text-sm font-semibold mb-4">⚡ One-Time Offer</p>
      <h1 class="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight mb-6">UPSELL_HEADLINE</h1>
      <p class="text-lg sm:text-xl text-white/70 mb-10">UPSELL_SUBHEADLINE</p>
      <div class="inline-flex items-center gap-3 mb-8">
        <span class="text-white/30 line-through text-2xl">ORIGINAL_PRICE</span>
        <span class="text-4xl font-extrabold text-amber-400">OFFER_PRICE</span>
      </div>
    </div>
  </section>
  <section id="offer-details" class="py-16 sm:py-20 bg-white/[0.02]">
    <div class="max-w-4xl mx-auto px-4 sm:px-8">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10">Everything Included</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div class="flex gap-4 p-5 rounded-2xl border border-white/10 bg-white/5"><div><h3 class="text-white font-bold mb-1">ITEM_1_TITLE</h3><p class="text-white/50 text-sm">ITEM_1_DESC</p></div></div>
        <div class="flex gap-4 p-5 rounded-2xl border border-white/10 bg-white/5"><div><h3 class="text-white font-bold mb-1">ITEM_2_TITLE</h3><p class="text-white/50 text-sm">ITEM_2_DESC</p></div></div>
        <div class="flex gap-4 p-5 rounded-2xl border border-white/10 bg-white/5"><div><h3 class="text-white font-bold mb-1">ITEM_3_TITLE</h3><p class="text-white/50 text-sm">ITEM_3_DESC</p></div></div>
        <div class="flex gap-4 p-5 rounded-2xl border border-white/10 bg-white/5"><div><h3 class="text-white font-bold mb-1">ITEM_4_TITLE</h3><p class="text-white/50 text-sm">ITEM_4_DESC</p></div></div>
      </div>
    </div>
  </section>
  <section id="testimonials" class="py-16 sm:py-24">
    <div class="max-w-4xl mx-auto px-4 sm:px-8">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10">Others Who Upgraded Are Loving It</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><p class="text-white/70 text-sm leading-relaxed mb-4">"UPSELL_T1_QUOTE"</p><p class="text-white font-semibold text-sm">UPSELL_T1_NAME</p><p class="text-white/40 text-xs">UPSELL_T1_ROLE</p></div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6"><p class="text-white/70 text-sm leading-relaxed mb-4">"UPSELL_T2_QUOTE"</p><p class="text-white font-semibold text-sm">UPSELL_T2_NAME</p><p class="text-white/40 text-xs">UPSELL_T2_ROLE</p></div>
      </div>
    </div>
  </section>
  <section id="cta" class="py-16 sm:py-24 text-center">
    <div class="max-w-xl mx-auto px-4 sm:px-8">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white mb-4">This Offer Expires Soon</h2>
      <p class="text-white/50 mb-8">URGENCY_TEXT</p>
      <a href="#" class="block w-full py-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-xl rounded-2xl hover:opacity-90 transition shadow-2xl mb-4">YES — ACCEPT_BUTTON_TEXT</a>
      <a href="#" class="block text-white/25 hover:text-white/50 text-sm transition">No thanks, I'll skip this offer</a>
    </div>
  </section>
  <footer id="footer" class="border-t border-white/5 py-8 text-center">
    <p class="text-white/20 text-xs">© 2025 BRAND_NAME. All rights reserved.</p>
  </footer>
</body>
</html>""",

    "THANKS": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thank You — BRAND_NAME</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>html { scroll-behavior: smooth; }</style>
</head>
<body style="font-family:'Inter',sans-serif; background:#0f0f1a; color:#f1f1f3;">
  <section id="hero" class="py-20 sm:py-32 text-center">
    <div class="max-w-2xl mx-auto px-4 sm:px-8">
      <div class="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-8 text-5xl">✓</div>
      <h1 class="text-4xl sm:text-5xl font-extrabold text-white mb-4">CONFIRMATION_HEADLINE</h1>
      <p class="text-lg text-white/60 mb-10">CONFIRMATION_SUBTEXT</p>
    </div>
  </section>
  <section id="next-steps" class="py-16 sm:py-20 bg-white/[0.02]">
    <div class="max-w-3xl mx-auto px-4 sm:px-8">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white text-center mb-10">Here's What Happens Next</h2>
      <div class="space-y-5">
        <div class="flex gap-4 items-start p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5"><div class="w-9 h-9 flex-shrink-0 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center">1</div><div><h3 class="text-white font-bold mb-1">NEXT_STEP_1_TITLE</h3><p class="text-white/50 text-sm">NEXT_STEP_1_DESC</p></div></div>
        <div class="flex gap-4 items-start p-5 rounded-2xl border border-white/10 bg-white/5"><div class="w-9 h-9 flex-shrink-0 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center">2</div><div><h3 class="text-white font-bold mb-1">NEXT_STEP_2_TITLE</h3><p class="text-white/50 text-sm">NEXT_STEP_2_DESC</p></div></div>
        <div class="flex gap-4 items-start p-5 rounded-2xl border border-white/10 bg-white/5"><div class="w-9 h-9 flex-shrink-0 rounded-full bg-cyan-600 text-white font-bold flex items-center justify-center">3</div><div><h3 class="text-white font-bold mb-1">NEXT_STEP_3_TITLE</h3><p class="text-white/50 text-sm">NEXT_STEP_3_DESC</p></div></div>
      </div>
    </div>
  </section>
  <section id="community" class="py-16 sm:py-20 text-center">
    <div class="max-w-2xl mx-auto px-4 sm:px-8">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white mb-4">COMMUNITY_HEADLINE</h2>
      <p class="text-white/50 mb-8">COMMUNITY_SUBTEXT</p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <a href="#" class="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-2xl hover:opacity-90 transition">SOCIAL_CTA_1</a>
        <a href="#" class="px-8 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition">SOCIAL_CTA_2</a>
      </div>
    </div>
  </section>
  <footer id="footer" class="border-t border-white/5 py-8 text-center">
    <p class="text-white/20 text-xs">© 2025 BRAND_NAME. All rights reserved.</p>
  </footer>
</body>
</html>""",
}


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


class ContactRequest(BaseModel):
    page_id: str
    name: str
    email: str
    phone: Optional[str] = ""
    message: Optional[str] = ""


def now_iso() -> str:
    return datetime.now().isoformat()


# --- Contacts storage ---

def load_contacts() -> list[dict]:
    if not CONTACTS_FILE.exists():
        return []
    return json.loads(CONTACTS_FILE.read_text(encoding="utf-8"))


def save_contacts(contacts: list[dict]):
    CONTACTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONTACTS_FILE.write_text(json.dumps(contacts, indent=2, ensure_ascii=True), encoding="utf-8")


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
    wf = settings.get("workflow_settings", {}).get("landing-pages") or {}
    provider = wf.get("provider", "anthropic")
    model = wf.get("model", "claude-sonnet-4-6")

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
    elif provider == "ollama":
        key = "ollama"
    else:
        raise HTTPException(400, f"Unsupported provider '{provider}'")

    return provider, model, key


def llm_generate(prompt: str, system: str = SYSTEM_PROMPT, max_tokens: int = 8192) -> str:
    provider, model, api_key = choose_provider_model()

    if provider == "anthropic":
        client = anthropic.Anthropic(api_key=api_key)
        kwargs: dict = dict(model=model, max_tokens=max_tokens, messages=[{"role": "user", "content": prompt}])
        if system:
            kwargs["system"] = system
        response = client.messages.create(**kwargs)
        text_blocks = [block.text for block in response.content if getattr(block, "type", None) == "text"]
        return "\n".join(text_blocks).strip()

    if provider == "ollama":
        client = OpenAI(api_key="ollama", base_url="http://localhost:11434/v1")
    else:
        base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else None
        client = OpenAI(api_key=api_key, base_url=base_url)

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = client.chat.completions.create(model=model, messages=messages, max_tokens=max_tokens)
    return (response.choices[0].message.content or "").strip()


def strip_code_fences(html: str) -> str:
    html = html.strip()
    html = re.sub(r'^```html\n?', '', html, flags=re.IGNORECASE)
    html = re.sub(r'\n?```$', '', html)
    html = re.sub(r'^```\n?', '', html)
    html = re.sub(r'\n?```$', '', html)
    return html.strip()


def fix_href_paths(html: str) -> str:
    def _replace(match: re.Match) -> str:
        path = match.group(1)
        slug = re.sub(r'^/', '', path)
        slug = re.sub(r'/', '-', slug)
        slug = re.sub(r'\.[^.]+$', '', slug)
        slug = re.sub(r'[^a-zA-Z0-9_-]', '-', slug)
        return f'href="#{slug}"'
    return re.sub(r'href="((?!#|mailto:|tel:|https?:|javascript:)[^"]+)"', _replace, html)


def ensure_html_doc(html: str) -> str:
    cleaned = html.strip()
    if cleaned.lower().startswith("<!doctype html"):
        return cleaned
    return f"<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\" /></head><body>{cleaned}</body></html>"


# Injected into every page — converts any stray non-anchor links to in-page anchors at runtime.
_ANCHOR_FIXER_SCRIPT = """<script>
(function(){
  var ALIASES={reviews:'testimonials',review:'testimonials',testimonial:'testimonials',
    testimonials:'testimonials',pricing:'pricing',price:'pricing',features:'features',
    feature:'features',benefits:'features',benefit:'features','how-it-works':'how-it-works',
    howitworks:'how-it-works',faq:'faq',faqs:'faq',contact:'cta',buy:'cta',signup:'cta',
    'sign-up':'cta','get-started':'cta','get-started-now':'cta',start:'cta',
    'start-now':'cta',about:'about','about-us':'about',home:'hero',index:'hero',
    community:'community','next-steps':'next-steps','offer-details':'offer-details'};
  function fix(){
    var ids=Array.from(document.querySelectorAll('[id]')).map(function(e){return e.id;});
    document.querySelectorAll('a[href]').forEach(function(a){
      var h=a.getAttribute('href')||'';
      if(!h||h.charAt(0)==='#'||/^(mailto:|tel:|https?:|javascript:)/i.test(h))return;
      var seg=h.replace(/^\/+/,'').replace(/[/?#].*/,'').replace(/\.[^.]+$/,'').toLowerCase().replace(/\s+/g,'-');
      var target=ALIASES[seg]||seg;
      if(ids.indexOf(target)!==-1){a.setAttribute('href','#'+target);}
      else{
        // last-resort: find first id that contains the segment
        var fuzzy=ids.filter(function(id){return id.indexOf(target)!==-1||target.indexOf(id)!==-1;})[0];
        a.setAttribute('href',fuzzy?'#'+fuzzy:'#');
      }
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',fix);}else{fix();}
})();
</script>"""


def inject_anchor_fixer(html: str) -> str:
    """Inject the anchor-fixer script before </body> (or append it)."""
    if _ANCHOR_FIXER_SCRIPT in html:
        return html  # already injected
    if "</body>" in html:
        return html.replace("</body>", _ANCHOR_FIXER_SCRIPT + "\n</body>", 1)
    return html + _ANCHOR_FIXER_SCRIPT


def _contact_form_script(page_id: str, api_base: str) -> str:
    return f"""<style>
#mc-modal-overlay{{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:99998;display:none;align-items:center;justify-content:center;padding:16px}}
#mc-modal-overlay.mc-open{{display:flex}}
#mc-modal{{background:#1a1a2e;border:1px solid rgba(255,255,255,.12);border-radius:20px;width:100%;max-width:460px;padding:32px;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.6)}}
#mc-modal h2{{margin:0 0 6px;color:#fff;font-size:1.35rem;font-weight:800;font-family:inherit}}
#mc-modal p.mc-sub{{margin:0 0 22px;color:rgba(255,255,255,.5);font-size:.875rem}}
.mc-field{{margin-bottom:14px}}
.mc-field label{{display:block;color:rgba(255,255,255,.6);font-size:.8rem;font-weight:600;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}}
.mc-field input,.mc-field textarea{{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;color:#fff;font-size:.9rem;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color .2s}}
.mc-field input:focus,.mc-field textarea:focus{{border-color:rgba(139,92,246,.6)}}
.mc-field textarea{{resize:vertical;min-height:90px}}
#mc-submit{{width:100%;padding:13px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:700;font-size:1rem;border:none;border-radius:12px;cursor:pointer;transition:opacity .2s;margin-top:6px;font-family:inherit}}
#mc-submit:hover{{opacity:.9}}#mc-submit:disabled{{opacity:.5;cursor:default}}
#mc-close{{position:absolute;top:14px;right:16px;background:none;border:none;color:rgba(255,255,255,.35);font-size:1.4rem;cursor:pointer;line-height:1;padding:4px}}
#mc-close:hover{{color:#fff}}
#mc-success{{text-align:center;padding:24px 0}}
#mc-success .mc-tick{{font-size:3rem;margin-bottom:12px}}
#mc-success h3{{color:#fff;font-size:1.2rem;font-weight:800;margin:0 0 8px}}
#mc-success p{{color:rgba(255,255,255,.5);font-size:.875rem;margin:0}}
</style>
<div id="mc-modal-overlay">
  <div id="mc-modal">
    <button id="mc-close" aria-label="Close">&times;</button>
    <div id="mc-form-wrap">
      <h2>Get a Free Quote</h2>
      <p class="mc-sub">Fill in your details and we'll get back to you shortly.</p>
      <form id="mc-form">
        <div class="mc-field"><label>Your Name</label><input type="text" name="name" placeholder="John Smith" required /></div>
        <div class="mc-field"><label>Email Address</label><input type="email" name="email" placeholder="john@example.com" required /></div>
        <div class="mc-field"><label>Phone <span style="color:rgba(255,255,255,.3);font-weight:400">(optional)</span></label><input type="tel" name="phone" placeholder="+44 7700 900000" /></div>
        <div class="mc-field"><label>Message</label><textarea name="message" placeholder="Tell us a bit about what you need..."></textarea></div>
        <button type="submit" id="mc-submit">Send Enquiry</button>
      </form>
      <div id="mc-error" style="color:#f87171;font-size:.8rem;margin-top:10px;display:none"></div>
    </div>
    <div id="mc-success" style="display:none">
      <div class="mc-tick">✅</div>
      <h3>Message received!</h3>
      <p>Thanks for getting in touch. We'll be in touch with you very soon.</p>
    </div>
  </div>
</div>
<script>
(function(){{
  var PAGE_ID={json.dumps(page_id)};
  var API_BASE={json.dumps(api_base)};
  var KEYWORDS=/quote|enquir|contact|book|get started|free consult|get in touch|call us|reach out|request|appointment|schedule/i;
  var overlay=document.getElementById('mc-modal-overlay');
  var formWrap=document.getElementById('mc-form-wrap');
  var successEl=document.getElementById('mc-success');
  var errorEl=document.getElementById('mc-error');
  var submitBtn=document.getElementById('mc-submit');

  function openModal(){{overlay.classList.add('mc-open');}}
  function closeModal(){{overlay.classList.remove('mc-open');}}

  document.getElementById('mc-close').addEventListener('click',closeModal);
  overlay.addEventListener('click',function(e){{if(e.target===overlay)closeModal();}});
  document.addEventListener('keydown',function(e){{if(e.key==='Escape')closeModal();}});

  function hookButtons(){{
    document.querySelectorAll('a,button').forEach(function(el){{
      if(el.__mcHooked)return;
      var text=(el.innerText||el.textContent||el.getAttribute('aria-label')||'').trim();
      var href=el.getAttribute('href')||'';
      if(KEYWORDS.test(text)||KEYWORDS.test(href)){{
        el.__mcHooked=true;
        el.addEventListener('click',function(e){{
          // Only intercept if it's not a real external link
          if(href&&(href.startsWith('http')||href.startsWith('mailto:')||href.startsWith('tel:')))return;
          e.preventDefault();
          openModal();
        }});
      }}
    }});
  }}

  document.getElementById('mc-form').addEventListener('submit',function(e){{
    e.preventDefault();
    var data=Object.fromEntries(new FormData(e.target).entries());
    if(!data.name||!data.email){{errorEl.textContent='Please fill in your name and email.';errorEl.style.display='block';return;}}
    submitBtn.disabled=true;
    submitBtn.textContent='Sending…';
    errorEl.style.display='none';
    fetch(API_BASE+'/api/landing-pages/contact',{{
      method:'POST',
      headers:{{'Content-Type':'application/json'}},
      body:JSON.stringify({{page_id:PAGE_ID,name:data.name,email:data.email,phone:data.phone||'',message:data.message||''}})
    }}).then(function(r){{
      if(!r.ok)throw new Error('Server error');
      formWrap.style.display='none';
      successEl.style.display='block';
      setTimeout(closeModal,3500);
    }}).catch(function(){{
      errorEl.textContent='Something went wrong. Please try again.';
      errorEl.style.display='block';
      submitBtn.disabled=false;
      submitBtn.textContent='Send Enquiry';
    }});
  }});

  if(document.readyState==='loading'){{document.addEventListener('DOMContentLoaded',hookButtons);}}else{{hookButtons();}}
  // Also hook after a short delay in case buttons are rendered by JS
  setTimeout(hookButtons,1000);
}})();
</script>"""


def inject_contact_form(html: str, page_id: str, api_base: str = "http://localhost:8000") -> str:
    """Inject the universal contact modal into a page."""
    marker = 'id="mc-modal-overlay"'
    if marker in html:
        return html  # already injected
    script = _contact_form_script(page_id, api_base)
    if "</body>" in html:
        return html.replace("</body>", script + "\n</body>", 1)
    return html + script


def full_page_edit(current_html: str, edit_prompt: str, ctx: dict) -> str:
    user_message = (
        f'You are editing a {ctx["label"]}.\n\n'
        f'EDIT INSTRUCTION: "{edit_prompt}"\n\n'
        f'Rules:\n'
        f'- Implement the edit completely and literally.\n'
        f'- If a quantity is specified (e.g. "3 testimonials"), produce EXACTLY that many with unique, realistic content.\n'
        f'- Preserve all sections and styling not being changed.\n\n'
        f'Current HTML:\n\n{current_html}\n\n'
        f'Return ONLY the complete updated HTML starting with <!DOCTYPE html>. No explanation, no markdown.'
    )
    raw = llm_generate(user_message)
    html = strip_code_fences(raw)
    doc_idx = html.lower().find('<!doctype')
    if doc_idx > 0:
        html = html[doc_idx:]
    return html if html else current_html


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


@router.get("/pages/{step_id}/preview")
def preview_page(step_id: str):
    """Serve the generated page HTML directly so the editor iframe can load it cross-origin."""
    db = load_db()
    _, step = find_step(db, step_id)
    page = step.get("page")
    if not page or not page.get("html_content"):
        return HTMLResponse(
            "<html><body style='font-family:sans-serif;display:flex;align-items:center;"
            "justify-content:center;height:100vh;background:#0f0f1a;color:rgba(255,255,255,.3)'>"
            "<p>No page generated yet</p></body></html>",
            status_code=200,
        )
    html = inject_contact_form(
        inject_anchor_fixer(fix_href_paths(page["html_content"])),
        page["id"],
        api_base="http://localhost:8000",
    )
    return HTMLResponse(html)


@router.post("/pages/generate")
def generate_page(body: GenerateRequest):
    if not body.prompt.strip():
        raise HTTPException(400, "Prompt is required")

    db = load_db()
    funnel, step = find_step(db, body.step_id)
    page = step.get("page")
    if not page:
        raise HTTPException(404, "Page not found")

    ctx = STEP_CONTEXT.get(step["type"], STEP_CONTEXT["LANDING"])
    template = TEMPLATES.get(step["type"], TEMPLATES["LANDING"])

    user_message = (
        f"You are transforming a skeleton HTML template into a fully designed, production-ready {ctx['label']}.\n\n"
        f"BRIEF:\n{body.prompt.strip()}\n\n"
        f"PAGE CONTEXT: {ctx['purpose']}\n\n"
        f"TEMPLATE TO ADAPT (replace every PLACEHOLDER with real, on-brand copy and real design):\n{template}\n\n"
        f"INSTRUCTIONS:\n"
        f"1. Keep EVERY section and its id attribute. Do not remove any section.\n"
        f"2. Replace every placeholder (e.g. BRAND_NAME, MAIN_HEADLINE, TESTIMONIAL_1_QUOTE) with vivid, realistic, on-brand copy tailored to the brief.\n"
        f"3. Restyle freely — change colors, gradients, fonts, spacing, card styles to match the brand's personality. The template structure is fixed; the visual design is yours.\n"
        f"4. All testimonial cards MUST be present with unique names, roles, and quotes.\n"
        f"5. Mobile-first: all sections must look great on 375px screens. Use responsive classes (sm:, md:, lg:).\n"
        f"6. Every section id must remain exactly as in the template.\n"
        f"7. CRITICAL — Anchor links only: Every link (nav, CTAs, footer) MUST use #anchor hrefs pointing to section ids on this page. Never use /page-path links. Include html {{ scroll-behavior: smooth; }} in the <style> block.\n"
        f"8. Return ONLY the complete HTML document. No explanation, no markdown fences."
    )
    raw = llm_generate(user_message)
    html = strip_code_fences(raw)
    doc_idx = html.lower().find('<!doctype')
    if doc_idx > 0:
        html = html[doc_idx:]
    html = inject_contact_form(
        inject_anchor_fixer(fix_href_paths(ensure_html_doc(html))),
        page["id"],
    )

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

    ctx = STEP_CONTEXT.get(step["type"], STEP_CONTEXT["LANDING"])
    current_html = page["html_content"]

    # --- Step 1: Parse sections with IDs ---
    soup = BeautifulSoup(current_html, "html.parser")
    sections = []
    skip_tags = {"script", "style", "head", "meta", "link", "html", "body"}
    for el in soup.find_all(id=True):
        tag = (el.name or "").lower()
        if tag in skip_tags:
            continue
        if el.find_parent(lambda p: p.get("id") and (p.name or "").lower() not in ("html", "body")):
            continue
        text = el.get_text(" ", strip=True)[:80]
        sections.append({"id": el.get("id"), "tag": tag, "text": text})

    if not sections:
        html = full_page_edit(current_html, body.edit_prompt.strip(), ctx)
    else:
        # --- Step 2: Ask Claude which section to target (tiny call, no HTML) ---
        outline = "\n".join(f'id="{s["id"]}" ({s["tag"]}): "{s["text"]}"' for s in sections)
        identify_prompt = (
            f'Page sections:\n{outline}\n\n'
            f'Edit needed: "{body.edit_prompt.strip()}"\n\n'
            f'Reply with ONLY the id value of the section that needs to change. Nothing else.'
        )
        raw_id = llm_generate(identify_prompt, system="", max_tokens=20).strip()
        raw_id = re.sub(r'^#', '', raw_id)
        raw_id = re.sub(r'[^a-zA-Z0-9_-]', '', raw_id)

        target_el = soup.find(id=raw_id)
        if not target_el:
            html = full_page_edit(current_html, body.edit_prompt.strip(), ctx)
        else:
            # --- Step 3: Edit the target section in isolation ---
            section_html = str(target_el)
            edit_system = (
                f'You are editing a single HTML section of a {ctx["label"]}. '
                f'Return ONLY the updated HTML for this one section — no full page, no explanation, no markdown fences. '
                f'Keep the outer element tag and the id="{raw_id}" attribute.'
            )
            edit_user = (
                f'Edit instruction: "{body.edit_prompt.strip()}"\n\n'
                f'Rules:\n'
                f'- If a quantity is specified (e.g. "3 testimonials"), produce EXACTLY that many with unique, distinct, realistic content.\n'
                f'- Keep the outer element and id="{raw_id}" unchanged.\n'
                f'- Match the existing Tailwind styling patterns in the section.\n'
                f'- Return ONLY the section HTML — nothing else, no DOCTYPE, no <html> tags.\n\n'
                f'Current section HTML:\n\n{section_html}'
            )
            new_section_raw = llm_generate(edit_user, system=edit_system, max_tokens=4096)
            new_section = strip_code_fences(new_section_raw)

            # --- Step 4: Splice updated section back into page ---
            target_el.replace_with(BeautifulSoup(new_section, "html.parser"))
            result = str(soup)
            if not result.lower().startswith('<!doctype'):
                result = '<!DOCTYPE html>\n' + result
            html = result

    page["html_content"] = inject_contact_form(
        inject_anchor_fixer(fix_href_paths(html)),
        page["id"],
    )
    page["updated_at"] = now_iso()
    history = page.get("prompt_history") or []
    history.append({
        "role": "user",
        "type": "edit",
        "content": body.edit_prompt.strip(),
        "timestamp": now_iso(),
    })
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

    raw_html = inject_anchor_fixer(fix_href_paths(matched_page["html_content"]))
    html = inject_contact_form(raw_html, matched_page["id"], api_base="")
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


# ---------------------------------------------------------------------------
# Contacts (universal quote / enquiry form)
# ---------------------------------------------------------------------------

@router.post("/contact")
def create_contact(body: ContactRequest):
    """Receive a contact/quote form submission from any landing page."""
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", body.email or ""):
        raise HTTPException(400, "Valid email is required")

    # Resolve page & funnel info for context
    db = load_db()
    page_slug = None
    funnel_name = None
    funnel_id = None
    try:
        _, step, page = find_page(db, body.page_id)
        page_slug = page.get("slug")
        # find funnel
        for f in db["funnels"]:
            for s in f["steps"]:
                if s["id"] == step["id"]:
                    funnel_name = f["name"]
                    funnel_id = f["id"]
                    break
    except Exception:
        pass

    contacts = load_contacts()
    entry = {
        "id": str(uuid.uuid4()),
        "page_id": body.page_id,
        "page_slug": page_slug,
        "funnel_id": funnel_id,
        "funnel_name": funnel_name,
        "name": body.name.strip(),
        "email": body.email.strip().lower(),
        "phone": (body.phone or "").strip() or None,
        "message": (body.message or "").strip() or None,
        "read": False,
        "created_at": now_iso(),
    }
    contacts.append(entry)
    save_contacts(contacts)
    return {"ok": True}


@router.get("/contacts")
def list_contacts(funnel_id: Optional[str] = None):
    """Return all contact submissions, optionally filtered by funnel."""
    contacts = load_contacts()
    if funnel_id:
        contacts = [c for c in contacts if c.get("funnel_id") == funnel_id]
    return sorted(contacts, key=lambda c: c["created_at"], reverse=True)


@router.patch("/contacts/{contact_id}/read")
def mark_contact_read(contact_id: str, read: bool = True):
    contacts = load_contacts()
    for c in contacts:
        if c["id"] == contact_id:
            c["read"] = read
            save_contacts(contacts)
            return c
    raise HTTPException(404, "Contact not found")


@router.delete("/contacts/{contact_id}")
def delete_contact(contact_id: str):
    contacts = load_contacts()
    before = len(contacts)
    contacts = [c for c in contacts if c["id"] != contact_id]
    if len(contacts) == before:
        raise HTTPException(404, "Contact not found")
    save_contacts(contacts)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Push to GitHub — sync latest page data to webspace repo and git push
# ---------------------------------------------------------------------------

@router.post("/push-to-github")
def push_to_github():
    """Sync latest landing page data to webspace/landing-pages and push to GitHub."""
    import shutil
    import subprocess

    WEBSPACE_DIR = ROOT / "webspace" / "landing-pages"
    if not WEBSPACE_DIR.exists():
        raise HTTPException(500, "webspace/landing-pages directory not found")

    # 1. Find the most recently updated page with HTML
    db = load_db()
    latest_page = None
    latest_time = ""
    for page in all_pages(db):
        if page.get("html_content") and page.get("updated_at", "") > latest_time:
            latest_time = page["updated_at"]
            latest_page = page

    if not latest_page:
        raise HTTPException(400, "No generated pages found — create at least one page first")

    # 2. Sync data files into webspace repo
    data_dst = WEBSPACE_DIR / "data"
    data_dst.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(DATA_FILE), str(data_dst / "landing_pages.json"))
    if CONTACTS_FILE.exists():
        shutil.copy2(str(CONTACTS_FILE), str(data_dst / "contacts.json"))

    # 3. Git operations
    def run_git(*args: str):
        return subprocess.run(
            ["git"] + list(args),
            cwd=str(WEBSPACE_DIR),
            capture_output=True,
            text=True,
            timeout=60,
        )

    # Verify it's a git repo
    status = run_git("status")
    if status.returncode != 0:
        raise HTTPException(
            500,
            "webspace/landing-pages is not a git repository. "
            "Open a terminal, cd into webspace/landing-pages, then run:\n"
            "  git init\n"
            "  git remote add origin https://github.com/goose956/landingpages.git\n"
            "  git branch -M main",
        )

    # Stage everything
    run_git("add", ".")

    # Check for changes
    diff = run_git("status", "--porcelain")
    slug = latest_page.get("slug") or latest_page.get("id", "")[:8]
    if not diff.stdout.strip():
        return {"ok": True, "message": "Already up to date — nothing new to push", "slug": slug}

    # Commit
    commit = run_git("commit", "-m", f"sync: update landing page data ({slug})")
    if commit.returncode != 0:
        raise HTTPException(500, f"Git commit failed:\n{commit.stderr or commit.stdout}")

    # Push
    push = run_git("push", "-u", "origin", "HEAD")
    if push.returncode != 0:
        raise HTTPException(
            500,
            f"Git push failed:\n{push.stderr or push.stdout}\n\n"
            "Make sure you have push access to the repo and git credentials are set up.",
        )

    return {"ok": True, "message": f"Pushed '{slug}' to GitHub successfully", "slug": slug}


# ---------------------------------------------------------------------------
# Sync to Production — POST local DB directly to Railway backend
# ---------------------------------------------------------------------------

@router.post("/sync-to-production")
def sync_to_production():
    """Send the full local landing_pages DB to the live Railway backend."""
    import urllib.error
    import urllib.request

    try:
        production_url = os.getenv("PRODUCTION_LP_URL", "").rstrip("/")
        sync_secret = os.getenv("PRODUCTION_LP_SECRET", "")

        if not production_url:
            raise HTTPException(
                400,
                "PRODUCTION_LP_URL is not set. Add it to your .env:\n"
                "PRODUCTION_LP_URL=https://landingpages-production-2dc8.up.railway.app",
            )

        db = load_db()
        funnels = db.get("funnels", [])
        page_count = sum(
            1 for f in funnels
            for s in f.get("steps", [])
            if s.get("page", {}).get("html_content")
        )

        if page_count == 0:
            raise HTTPException(400, "No generated pages found locally — generate at least one page first")

        payload = json.dumps(db).encode("utf-8")
        req = urllib.request.Request(
            f"{production_url}/sync",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Sync-Secret": sync_secret,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        return {
            "ok": True,
            "message": f"Synced {result.get('funnels', 0)} funnels ({result.get('pages_with_html', 0)} pages) to production",
            "funnels": result.get("funnels", 0),
            "pages": result.get("pages_with_html", 0),
        }

    except HTTPException:
        raise
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(500, f"Production API returned {e.code}: {body}")
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {type(e).__name__}: {e}")
