# SKILL: Specification Bot

## Purpose
Lead user through 5-6 clarifying questions and produce a structured software specification document, rendered to PDF.

## Trigger
User runs `/spec` or asks to "create a spec" for a new app or feature.

## Steps

1. **Gather context** — Ask these questions one at a time (wait for answer before next):
   - What is the name and one-line purpose of this product/feature?
   - Who is the primary user and what problem does it solve for them?
   - What are the 3 most critical user actions (core flows)?
   - What integrations or external services are required?
   - What does "done" look like — how will you know it works?
   - Any constraints (budget, timeline, tech stack preferences)?

2. **Synthesize** — Combine answers into a structured Markdown spec:
   - Overview, Goals, Non-Goals
   - User Stories
   - Technical Requirements
   - Open Questions

3. **Write** — Save to `shared/specs/SPEC_<slug>_v1.md`

4. **Render** — Convert to PDF via WeasyPrint pipeline:
   `python agents/documents/render_pdf.py shared/specs/SPEC_<slug>_v1.md`

5. **Output** — Confirm path of rendered PDF to user.

## Model tier
Elite (Sonnet) — spec quality is high-stakes.

## Output contract
- Markdown spec at `shared/specs/`
- PDF at `shared/exports/`
