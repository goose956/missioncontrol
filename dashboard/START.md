# Starting Mission Control Dashboard

## 1. Backend (FastAPI)

```bash
cd dashboard/backend

# First time only — install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --port 8000
```

Runs at: http://localhost:8000
API docs: http://localhost:8000/docs

## 2. Frontend (Next.js)

```bash
cd dashboard/frontend

# First time only — deps already installed by create-next-app
# npm install

# Start the dev server
npm run dev
```

Runs at: http://localhost:3000

## 3. Configure LLM Providers

Open `http://localhost:3000/settings` and add API keys for:

- Anthropic
- OpenAI
- OpenRouter

Then choose provider/model per workflow from the same Settings page.

Local settings are saved to:

- `dashboard/backend/data/llm_settings.json` (gitignored)

## Adding Workflows

Create a new file: `dashboard/backend/workflows/<name>.yaml`

```yaml
id: my-workflow
name: My Workflow
description: What this workflow does
icon: 🚀
model: claude-opus-4-7
output_folder: shared/artifacts/my-workflow

system_prompt: |
  You are a ...
```

Restart the backend — the new workflow appears on the dashboard automatically.

## File Structure

- Conversations auto-saved to the workflow's `output_folder`
- Files visible in the `/files` browser
- Add any folder to `WATCHED_FOLDERS` in `dashboard/backend/routers/files.py`
- Projects workspace: `/projects`
- Specification workspace: `/chat/spec-bot`
- Code Assistant workspace: `/chat/coder`
