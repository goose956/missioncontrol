# Mission Control CLI — SKILL.md

## What this skill does
`mc.py` is the terminal interface to Mission Control. Every function available
in the dashboard UI is also available as a CLI command with a `--json` flag,
making the entire app controllable by Claude Code or a LangGraph agent without
a browser.

## Location
```
dashboard/backend/mc.py
```

## Prerequisites
```bash
cd dashboard/backend
pip install -r requirements.txt   # includes typer, rich, anthropic
# ANTHROPIC_API_KEY must be set in .env at project root
```

## Full Command Reference

```
mc ideas list      [--status] [--category] [--json]
mc ideas create    --title --category --description [--status] [--json]
mc ideas update    <id>  [--title] [--status] [--description] [--json]
mc ideas delete    <id>  [--yes]
mc ideas rewrite   <id>  [--apply] [--json]

mc projects list   [--status] [--json]
mc projects create --title --description [--idea-id] [--spec] [--json]
mc projects update <id>  [--status] [--title] [--spec] [--json]
mc projects show   <id>  [--json]

mc files list      [--folder] [--ext] [--json]
mc files read      <path>

mc chat workflows  [--json]
mc chat run        --workflow --message [--save/--no-save] [--json]

mc spec            --idea-id <id> [--message] [--local] [--json]

mc models          [--json]
```

## Local Model Flag (`--local`)

Pass `--local` to route the LLM call to your local Ollama instance (Qwen2.5 7B)
instead of the Anthropic API. Great for cheap, fast iteration:

```bash
# Rewrite idea description locally (free, ~3s)
python mc.py ideas rewrite <id> --apply --local

# Run a workflow locally
python mc.py chat run --workflow coder --message "Review this" --local --json

# Generate a spec locally (quality lower than Claude, but free)
python mc.py spec --idea-id <id> --local --json

# List available local models
python mc.py models
```

### Setup (one-time)
```bash
# 1. Install Ollama: https://ollama.com/download
# 2. Pull the model (4.7 GB download):
ollama pull qwen2.5
# 3. Verify
python mc.py models
```

### Cost routing guide
| Task | Recommended |
|------|-------------|
| Idea rewrites, summarisation | `--local` (free) |
| Planner / coder workflows | `--local` for drafts, Claude for finals |
| Spec generation | Claude (better output) |
| Research / analysis | Claude |

## The --json Rule
Every command that produces data returns clean JSON when `--json` is passed.
JSON goes to **stdout**. Status messages and progress go to **stderr**.
This means agents can pipe output without stripping noise:

```bash
IDEA=$(python mc.py ideas list --status draft --json | python -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
python mc.py spec --idea-id $IDEA --json
```

## End-to-End Agent Workflow: Idea → Spec → Project

```bash
# Step 1: find a working idea
python mc.py ideas list --status draft --json

# Step 2: rewrite the description (optional)
python mc.py ideas rewrite <id> --apply --json

# Step 3: generate a spec document
python mc.py spec --idea-id <id> --json
# → returns { "saved_path": "shared/specs/spec_<slug>_<ts>.md" }

# Step 4: create a project linked to the idea + spec
python mc.py projects create \
  --title "My App" \
  --idea-id <id> \
  --spec "shared/specs/spec_<slug>_<ts>.md" \
  --json

# Step 5: generate an implementation plan
python mc.py chat run \
  --workflow planner \
  --message "$(python mc.py files read shared/specs/spec_<slug>_<ts>.md)" \
  --json

# Step 6: hand off to coder
python mc.py chat run \
  --workflow coder \
  --message "Implement step 1 of the plan: ..." \
  --json
```

## Adding New Commands (for future features)

When a new feature is added to the dashboard:
1. Add the corresponding function to `mc.py` under the right sub-app
2. Add `--json` output covering all returned fields
3. Update the relevant workspace `AGENTS.md` with the new command and its sequence
4. Update this SKILL.md command reference table

This keeps the agent surface in sync with the UI as the app grows.
