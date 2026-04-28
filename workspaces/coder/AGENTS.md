# Coder Workspace — Agent Guide

Stores code assistant outputs: architecture notes, code reviews, debugging sessions.
Claude Code itself operates in this workspace when doing implementation work.

## Data
- **Output files:** `workspaces/coder/*.md` (auto-saved by the Code Assistant workflow)
- **No structured JSON store** — outputs are freeform markdown documents

---

## CLI Commands

### Run the code assistant workflow
```bash
python mc.py chat run \
  --workflow coder \
  --message "Review this function and suggest improvements: ..." \
  --json
```
**Returns:** `{ "workflow", "response", "saved_path", "input_tokens", "output_tokens" }`

### List saved coder outputs
```bash
python mc.py files list --folder workspaces/coder --json
```

### Read a specific output
```bash
python mc.py files read workspaces/coder/<filename>.md
```

---

## Typical Agent Sequence

```
1. files list --folder workspaces/coder --json   → check existing work
2. chat run --workflow coder \
     --message "Implement X based on spec at shared/specs/..." \
     --json                                       → get implementation guidance
3. files read <saved_path>                        → verify output
4. projects update <id> --status active           → update project status
```

---

## Conventions
- Outputs auto-named: `coder_YYYYMMDD_HHMMSS.md`
- Always pass the spec file path in your message for context
- Use `--no-save` flag if just asking quick questions, not doing implementation work
