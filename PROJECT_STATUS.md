# Mission Control Project Status

Updated: 2026-04-24

## Overview

Mission Control is currently in a functional internal MVP stage with a working FastAPI backend and Next.js frontend dashboard.

Core architecture is local-first: workflows are configured as YAML, outputs are saved into workspace folders, and the dashboard exposes chat, ideas, projects, file browsing, and settings.

## What Has Been Implemented

### Dashboard foundation

- FastAPI backend with routers for:
  - `chat`
  - `files`
  - `ideas`
  - `projects`
  - `settings`
  - `workflows`
- Next.js frontend with left navigation and dedicated workspaces/pages.

### Workflow chat system

- Dynamic workflow loading from `dashboard/backend/workflows/*.yaml`.
- Streaming responses (SSE) in chat UI.
- Auto-save of workflow outputs to configured output folders.
- Save extension support per workflow (`save_extension`).
- `spec-bot` configured to save `.txt` outputs for easier editing.

### Specification workspace

- Dedicated `Specification` route (`/chat/spec-bot`) with split layout:
  - Left: chat (1/3 desktop)
  - Right: document thumbnails + full text editor (2/3 desktop)
- Spec docs loaded from `shared/specs`.
- In-app save back to disk through backend file write endpoint.

### Ideas workspace

- Ideas CRUD + ranking/reordering + status/category filters.
- AI rewrite/enhance flow for idea descriptions.
- Brighter color-coded idea rows by category.

### Projects workspace

- New `Projects` page at `/projects` to centralize work:
  - Create/edit/delete projects
  - Link each project to an idea and spec document
  - Track project status
- File upload flow with drag/drop and file picker.
- Upload prompt asks which project files should be saved to.
- Upload files stored under `workspaces/projects/<project_id>/uploads`.
- Projects persisted in `workspaces/projects/projects.json` (runtime file).

### Code Assistant workspace

- `Code Assistant` moved to dedicated route (`/chat/coder`) below `Specification` in sidebar.
- Split workspace with:
  - Left: chat
  - Right: preview URL panel (`iframe`) for app preview
  - Project loader panel to push project context into composer
  - "Created Software" inventory based on `webspace/`
  - Saved code session list from `workspaces/coder/`

### Files workspace enhancements

- File browser includes additional folders including:
  - `workspaces/projects`
  - `webspace`
- Read endpoint for text-based files.
- Write endpoint for editable text files in dashboard.
- Print endpoint for Markdown export flow.

### LLM settings and model selection

- New `Settings` page at `/settings`.
- Supports API key storage for:
  - Anthropic
  - OpenAI
  - OpenRouter
- Per-workflow provider/model selection from the UI.
- Backend `chat` router resolves provider/model from saved settings.
- Provider routing implemented:
  - Anthropic API
  - OpenAI API
  - OpenRouter via OpenAI-compatible client and base URL
- Settings persisted locally in:
  - `dashboard/backend/data/llm_settings.json` (gitignored)

## Current Developer Workflow

1. Start backend: `cd dashboard/backend && uvicorn main:app --reload --port 8000`
2. Start frontend: `cd dashboard/frontend && npm run dev`
3. Open dashboard: `http://localhost:3000`
4. Add/update provider keys/models: `http://localhost:3000/settings`

## Known Scope / Gaps

- No formal automated test suite yet (unit/integration/e2e).
- Local trusted-environment assumptions still apply.
- Runtime data files are local-first and not intended as canonical production storage.

## Key Paths

- Backend entry: `dashboard/backend/main.py`
- Frontend layout/nav: `dashboard/frontend/app/layout.tsx`, `dashboard/frontend/components/Sidebar.tsx`
- Workflows config: `dashboard/backend/workflows/`
- Settings API: `dashboard/backend/routers/settings.py`
- Chat provider routing: `dashboard/backend/routers/chat.py`
- Project docs/output locations: `shared/specs/`, `workspaces/coder/`, `workspaces/projects/`, `webspace/`
