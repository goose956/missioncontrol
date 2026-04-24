import io
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import chat, files, ideas, landing_pages, media, projects, settings, workflows

load_dotenv(Path(__file__).parent.parent.parent / ".env")

# Force stdout/stderr to UTF-8 on Windows so uvicorn logging doesn't crash on emoji
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class SafeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(jsonable_encoder(content), ensure_ascii=True).encode("utf-8")


app = FastAPI(title="Mission Control API", default_response_class=SafeJSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(ideas.router, prefix="/api/ideas", tags=["ideas"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(landing_pages.router, prefix="/api/landing-pages", tags=["landing-pages"])
app.include_router(media.router, prefix="/api/media", tags=["media"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
