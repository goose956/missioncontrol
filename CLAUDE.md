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
**Milestone 2** — CLI wrap + agent-controllable surface

## CLI — Primary Agent Interface

Every function is accessible via terminal. Always prefer CLI over direct file edits.

```bash
cd dashboard/backend

python mc.py ideas list --json
python mc.py ideas create --title "X" --category saas --description "Y" --json
python mc.py spec --idea-id <id> --json
python mc.py projects list --json
python mc.py chat run --workflow coder --message "..." --json
python mc.py files list --folder shared/specs --json
```

Full reference: `skills/mc-cli/SKILL.md`

## Key Conventions
- Every workspace folder has its own `AGENTS.md` — read it before operating in that workspace
- All CLI commands support `--json` for agent-readable output (stdout); progress goes to stderr
- Specs live in `shared/specs/` as Markdown
- All agent outputs written to workspace folders before being promoted to `shared/artifacts/`
- Secrets live in `.env` at project root (never committed)
- When adding a new feature: (1) add to dashboard UI, (2) add to `mc.py`, (3) update workspace `AGENTS.md`, (4) update `skills/mc-cli/SKILL.md`

## Model Routing (config/models.yaml)
See `config/models.yaml` for tier assignments.
