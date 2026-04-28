# Mission Control Project Status

Updated: 2026-04-28

## Overview

Mission Control is in an internal alpha stage with a broad, working feature surface across chat workflows, project operations, landing pages, ad creation, and media indexing.

Architecture remains local-first: workflow YAML definitions drive chat behavior, outputs are saved to workspace folders, and runtime state is stored in local JSON files.

## Implemented Surface

### Backend API modules

- FastAPI routers mounted in `dashboard/backend/main.py`:
  - `chat`
  - `files`
  - `ideas`
  - `projects`
  - `settings`
  - `landing-pages`
  - `media`
  - `workflows`
- Safe JSON encoding for responses via `SafeJSONResponse`.

### Frontend workspaces/routes

- Primary dashboard pages in `dashboard/frontend/app/`:
  - `/`
  - `/projects`
  - `/ideas`
  - `/landing-pages`
  - `/media`
  - `/files`
  - `/settings`
  - `/chat/[workflow]` with dedicated behavior for `spec-bot`, `coder`, and `ad-creator`.
- Landing pages detail routes implemented:
  - `/landing-pages/[id]`
  - `/landing-pages/[id]/analytics`
  - `/landing-pages/[id]/steps/[stepId]`
  - `/landing-pages/contacts`

### Workflow chat and output

- Dynamic workflow loading from `dashboard/backend/workflows/*.yaml`.
- SSE-based chat streaming.
- Per-workflow save behavior, including extension control (`save_extension`).
- Workflow save events emitted into media timeline (`workflow_save`).

### Projects and file handling

- Projects CRUD with idea/spec linking and status tracking.
- Project file uploads saved under `workspaces/projects/<project_id>/uploads`.
- New-project modal supports attaching files during project creation (create + upload in one flow).
- File API includes read/write/upload/raw helpers for local artifacts.

### Landing pages

- Native funnel CRUD and step-level page editing flow.
- Analytics view with per-step views and signup exports.
- Contacts route added for lead visibility.

### Ad Creator and Media

- Dedicated ad creator workflow route with image-centric workspace.
- Media workspace supports:
  - source configuration
  - Screenpipe connectivity checks
  - index refresh
  - highlight extraction
  - timeline with workflow/event filters
  - thumbnail generation (ffmpeg if available)
  - opening media paths and saved artifacts
  - recording-readiness guidance and setup checks

### Settings and model routing

- UI/API support for Anthropic, OpenAI, and OpenRouter keys.
- Per-workflow provider/model settings.
- Runtime provider resolution in chat router.

### CLI progress

- `dashboard/backend/mc.py` now exists as a multi-command Mission Control CLI scaffold.
- `typer` and `rich` are included in backend requirements for CLI surfaces.

## Current Health Snapshot

- Frontend diagnostics are currently clean after landing-pages and chat hook fixes.
- Repo is in active development with multiple uncommitted tracked/untracked changes.
- No formal automated test suite is established yet.

## Current Developer Workflow

1. Backend: `cd dashboard/backend && uvicorn main:app --reload --port 8000`
2. Frontend: `cd dashboard/frontend && npm run dev`
3. Dashboard: `http://localhost:3000`
4. Health check: `http://localhost:8000/api/health`

## Known Gaps

- No automated regression coverage (unit/integration/e2e).
- Local JSON persistence is suitable for local operations but not a production-grade shared database layer.
- Ongoing branch churn means release checkpoints should be cut more frequently.

## Key Paths

- Backend entry: `dashboard/backend/main.py`
- Backend routers: `dashboard/backend/routers/`
- Workflow definitions: `dashboard/backend/workflows/`
- Frontend nav: `dashboard/frontend/components/Sidebar.tsx`
- Frontend routes: `dashboard/frontend/app/`
- Runtime data roots: `workspaces/`, `shared/`, `webspace/`
