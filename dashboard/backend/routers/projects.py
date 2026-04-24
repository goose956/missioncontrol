import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Form, UploadFile
from pydantic import BaseModel

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent
PROJECTS_FILE = ROOT / "workspaces" / "projects" / "projects.json"
PROJECTS_DIR = ROOT / "workspaces" / "projects"

STATUSES = ["draft", "active", "blocked", "complete", "archived"]


class ProjectFile(BaseModel):
    name: str
    path: str
    size: int
    uploaded_at: str


class ProjectCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "draft"
    idea_id: Optional[str] = None
    spec_path: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    idea_id: Optional[str] = None
    spec_path: Optional[str] = None


def load_projects() -> list:
    if not PROJECTS_FILE.exists():
        return []
    return json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))


def save_projects(projects: list):
    PROJECTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PROJECTS_FILE.write_text(json.dumps(projects, indent=2, ensure_ascii=True), encoding="utf-8")


def find_project(projects: list, project_id: str) -> dict:
    for project in projects:
        if project["id"] == project_id:
            return project
    raise HTTPException(404, "Project not found")


def clean_filename(name: str) -> str:
    base = name.split("/")[-1].split("\\")[-1]
    return re.sub(r"[^A-Za-z0-9._-]", "_", base)


@router.get("")
def list_projects():
    projects = load_projects()
    return sorted(projects, key=lambda x: x.get("updated_at", ""), reverse=True)


@router.post("")
def create_project(body: ProjectCreate):
    if body.status not in STATUSES:
        raise HTTPException(400, "Invalid status")

    projects = load_projects()
    now = datetime.now().isoformat()
    project = {
        "id": str(uuid.uuid4()),
        "title": body.title,
        "description": body.description,
        "status": body.status,
        "idea_id": body.idea_id,
        "spec_path": body.spec_path,
        "files": [],
        "created_at": now,
        "updated_at": now,
    }
    projects.append(project)
    save_projects(projects)
    return project


@router.put("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate):
    projects = load_projects()
    project = find_project(projects, project_id)

    if body.status is not None and body.status not in STATUSES:
        raise HTTPException(400, "Invalid status")

    if body.title is not None:
        project["title"] = body.title
    if body.description is not None:
        project["description"] = body.description
    if body.status is not None:
        project["status"] = body.status
    if body.idea_id is not None:
        project["idea_id"] = body.idea_id
    if body.spec_path is not None:
        project["spec_path"] = body.spec_path

    project["updated_at"] = datetime.now().isoformat()
    save_projects(projects)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: str):
    projects = load_projects()
    filtered = [project for project in projects if project["id"] != project_id]
    save_projects(filtered)
    return {"ok": True}


@router.post("/{project_id}/upload")
async def upload_project_file(project_id: str, file: UploadFile = File(...), note: Optional[str] = Form(default=None)):
    projects = load_projects()
    project = find_project(projects, project_id)

    safe_name = clean_filename(file.filename or "upload.bin")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stored_name = f"{timestamp}_{safe_name}"

    project_upload_dir = PROJECTS_DIR / project_id / "uploads"
    project_upload_dir.mkdir(parents=True, exist_ok=True)
    output_path = project_upload_dir / stored_name

    content = await file.read()
    output_path.write_bytes(content)

    rel = str(output_path.relative_to(ROOT)).replace("\\", "/")
    file_entry = {
        "name": safe_name,
        "path": rel,
        "size": len(content),
        "uploaded_at": datetime.now().isoformat(),
    }
    if note:
        file_entry["note"] = note

    files = project.get("files") or []
    files.append(file_entry)
    project["files"] = files
    project["updated_at"] = datetime.now().isoformat()

    save_projects(projects)
    return file_entry
