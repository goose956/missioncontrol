# Planner Workspace — Agent Guide

Stores strategic plans, task breakdowns, and implementation roadmaps.
The Planner workflow takes a goal and produces structured implementation plans.

## Data
- **Output files:** `workspaces/planner/*.md` (auto-saved by the Planner workflow)

---

## CLI Commands

### Generate a plan
```bash
python mc.py chat run \
  --workflow planner \
  --message "Break down the implementation of: <project description>" \
  --json
```
**Returns:** `{ "workflow", "response", "saved_path", "input_tokens", "output_tokens" }`

### List saved plans
```bash
python mc.py files list --folder workspaces/planner --json
```

### Read a plan
```bash
python mc.py files read workspaces/planner/<filename>.md
```

---

## Typical Agent Sequence

```
1. spec --idea-id <id> --json                     → get spec first
2. chat run --workflow planner \
     --message "Create implementation plan for: <spec content>" \
     --json                                        → generate plan
3. files list --folder workspaces/planner --json   → confirm saved
4. chat run --workflow coder \
     --message "Implement step 1 from plan: ..." \
     --json                                        → hand off to coder
```

---

## Conventions
- Always include the spec content or path in your planner message
- Plans use `[ ]` / `[x]` checkboxes for task tracking
- Outputs auto-named: `planner_YYYYMMDD_HHMMSS.md`
