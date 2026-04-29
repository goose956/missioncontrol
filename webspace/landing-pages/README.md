# Landing Pages — Railway Deployment

Two Railway services from this repo:

| Service | Root | Build | Start |
|---------|------|-------|-------|
| `lp-backend` | `backend/` | nixpacks auto | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| `lp-frontend` | `frontend/` | nixpacks auto (Next.js) | `node .next/standalone/server.js` |

---

## First-time Railway setup

1. Create a new project in Railway
2. Add service → **GitHub** → pick `goose956/landingpages`
   - Service 1 (backend): set **Root Directory** to `backend/`
   - Service 2 (frontend): set **Root Directory** to `frontend/`

### Backend env vars
| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | your key (or `OPENROUTER_API_KEY`) |
| `OPENROUTER_API_KEY` | optional fallback |
| `DATA_DIR` | `/data` (after attaching a Volume) |
| `ALLOWED_ORIGINS` | your frontend Railway URL e.g. `https://lp-frontend.up.railway.app` |

**Attach a Volume** to the backend service:
- Mount path: `/data`
- This keeps `landing_pages.json` and `contacts.json` alive across deploys

### Frontend env vars
| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | your backend Railway URL e.g. `https://lp-backend.up.railway.app` |
| `ADMIN_PASSWORD` | your chosen password (default: `admin`) |

---

## Local development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Visit http://localhost:3001 → login with your ADMIN_PASSWORD.

---

## Push from Mission Control

Use the **Push to GitHub** button on the Mission Control landing pages dashboard.
It syncs your local `landing_pages.json` into this repo and pushes to `main`.
Railway auto-deploys on push.

> **First push setup** — open a terminal, `cd` into `webspace/landing-pages`, then:
> ```bash
> git init
> git remote add origin https://github.com/goose956/landingpages.git
> git branch -M main
> git add .
> git commit -m "init"
> git push -u origin main
> ```
