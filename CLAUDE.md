# MISSION CONTROL — Agent Ecosystem Root

## What this is
A local-first autonomous agent ecosystem. Human does high-level design; agents handle execution.

## Philosophy: Local First, Cloud Last
- **Hard design / architecture** → Claude Sonnet (via Claude Code or API)
- **Grunt work / iteration** → OpenRouter (Haiku, Flash)
- **Formatting / extraction / local ops** → local SLMs (Phi-3, Llama when added)

## Folder Map
| Folder | Purpose | Agent Type |
|--------|---------|-----------|
| `workspaces/planner` | Strategic plans, task queues | Supervisor / Planner |
| `workspaces/coder` | Source code, tests, PRs | Coder subgraph |
| `workspaces/media` | Video, recordings, ad creative | Media agent |
| `workspaces/documents` | Spec PDFs, user guides | Documents agent |
| `workspaces/ideas` | Research, new product concepts | Research analyst |
| `workspaces/landing-pages` | Product landing pages | Landing page agent |
| `agents/` | LangGraph subgraph definitions | — |
| `skills/` | SKILL.md files + Claude Code skills | — |
| `memory/` | LanceDB / ChromaDB / SQLite stores | — |
| `dashboard/` | Mission Control UI (FastAPI + Next.js) | — |
| `webspace/` | Railway-deployed apps | — |
| `shared/artifacts` | Cross-agent outputs | — |
| `config/` | Model routing, agent config | — |

## Active Milestone
**Milestone 1** — Spec Bot + workspace scaffolding

## Key Conventions
- Every workspace folder has its own `AGENTS.md` describing the agent contract
- Specs live in `shared/specs/` as Markdown, rendered to PDF via WeasyPrint
- All agent outputs are written to `shared/artifacts/` before being promoted
- Secrets live in `.env` (never committed)

## Model Routing (config/models.yaml)
See `config/models.yaml` for tier assignments.
