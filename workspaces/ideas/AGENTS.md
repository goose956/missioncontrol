# Ideas Workspace — Agent Guide

Stores all product ideas captured via the Mission Control Ideas Lab.
Ideas have categories (saas, skill, landing-page, ad-ideas, misc), statuses, and a priority rank.

## Data
- **Store:** `workspaces/ideas/ideas.json`
- **Format:** JSON array sorted by `rank` (1 = highest priority)

---

## CLI Commands

Run from `dashboard/backend/`:

### List ideas
```bash
python mc.py ideas list --json
python mc.py ideas list --status working --json
python mc.py ideas list --category saas --json
```
**Returns:** array of idea objects with id, rank, title, category, description, status, created_at.

### Create an idea
```bash
python mc.py ideas create \
  --title "My SaaS idea" \
  --category saas \
  --description "A platform that does X for Y users" \
  --json
```

### Update an idea (use first 8 chars of ID)
```bash
python mc.py ideas update abc12345 --status working --json
python mc.py ideas update abc12345 --description "Revised description" --json
```

### AI-rewrite a description
```bash
python mc.py ideas rewrite abc12345 --apply --json
```
Returns: `{ "id", "title", "rewritten", "applied" }`

### Delete
```bash
python mc.py ideas delete abc12345 --yes
```

---

## Typical Agent Sequence

```
1. ideas list --json                              → find idea ID
2. ideas update <id> --status working             → mark in progress
3. spec --idea-id <id> --json                     → generate spec (saves to shared/specs/)
4. projects create --title "X" --idea-id <id> \
     --spec <saved_path> --json                   → create linked project
5. ideas update <id> --status complete            → mark done
```

---

## Field Reference

| Field | Values |
|-------|--------|
| category | saas, skill, landing-page, ad-ideas, misc |
| status | draft, working, complete, archived |
| rank | integer — 1 is highest priority |
