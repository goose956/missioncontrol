from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse, HTMLResponse, FileResponse
from pydantic import BaseModel
import markdown as md_lib

router = APIRouter()

ROOT = Path(__file__).parent.parent.parent.parent

# Folders exposed to the file browser
WATCHED_FOLDERS = [
    "shared/specs",
    "shared/artifacts",
    "shared/exports",
    "webspace",
    "workspaces/planner",
    "workspaces/coder",
    "workspaces/ideas",
    "workspaces/projects",
    "workspaces/documents",
    "workspaces/media",
    "workspaces/landing-pages",
]

READABLE_EXTENSIONS = {".md", ".txt", ".yaml", ".yml", ".json", ".py", ".ts", ".tsx", ".js", ".html", ".css"}

WRITABLE_EXTENSIONS = {".md", ".txt", ".yaml", ".yml", ".json", ".py", ".ts", ".tsx", ".js", ".html", ".css"}

UPLOADABLE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".tif", ".tiff", ".ico"
}


class WriteFileRequest(BaseModel):
    path: str
    content: str


@router.get("")
def list_files():
    tree = []
    for folder in WATCHED_FOLDERS:
        folder_path = ROOT / folder
        if not folder_path.exists():
            continue
        files = []
        for f in sorted(folder_path.rglob("*")):
            if f.is_file() and not f.name.startswith("."):
                rel = f.relative_to(ROOT)
                files.append({
                    "name": f.name,
                    "path": str(rel).replace("\\", "/"),
                    "size": f.stat().st_size,
                    "modified": f.stat().st_mtime,
                    "readable": f.suffix in READABLE_EXTENSIONS,
                })
        tree.append({
            "folder": folder,
            "files": sorted(files, key=lambda x: x["modified"], reverse=True),
        })
    return tree


@router.get("/read")
def read_file(path: str):
    safe_path = ROOT / path.lstrip("/")
    # Prevent path traversal
    try:
        safe_path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        raise HTTPException(403, "Access denied")

    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(404, "File not found")

    if safe_path.suffix not in READABLE_EXTENSIONS:
        raise HTTPException(400, "File type not readable")

    return PlainTextResponse(safe_path.read_text(encoding="utf-8", errors="replace"))


@router.get("/raw")
def raw_file(path: str):
    safe_path = ROOT / path.lstrip("/")
    try:
        safe_path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        raise HTTPException(403, "Access denied")

    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(404, "File not found")

    return FileResponse(safe_path)


@router.post("/write")
def write_file(body: WriteFileRequest):
    safe_path = ROOT / body.path.lstrip("/")
    try:
        safe_path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        raise HTTPException(403, "Access denied")

    if safe_path.suffix not in WRITABLE_EXTENSIONS:
        raise HTTPException(400, "File type not writable")

    safe_path.parent.mkdir(parents=True, exist_ok=True)
    safe_path.write_text(body.content, encoding="utf-8")
    return {"ok": True, "path": str(safe_path.relative_to(ROOT)).replace("\\", "/")}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), folder: str = Form(...)):
    safe_dir = ROOT / folder.lstrip("/")
    try:
        safe_dir.resolve().relative_to(ROOT.resolve())
    except ValueError:
        raise HTTPException(403, "Access denied")

    filename = Path(file.filename or "upload.bin").name
    suffix = Path(filename).suffix.lower()
    if suffix not in UPLOADABLE_EXTENSIONS:
        raise HTTPException(400, "File type not uploadable")

    safe_dir.mkdir(parents=True, exist_ok=True)
    target = safe_dir / filename
    if target.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target = safe_dir / f"{Path(filename).stem}_{timestamp}{suffix}"

    data = await file.read()
    target.write_bytes(data)

    return {
        "ok": True,
        "name": target.name,
        "path": str(target.relative_to(ROOT)).replace("\\", "/"),
        "size": len(data),
    }


PRINT_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.7;
  color: #111;
  background: white;
  max-width: 750px;
  margin: 0 auto;
  padding: 40px 50px;
}
h1 { font-size: 22pt; margin: 0 0 6px; }
h2 { font-size: 15pt; margin: 28px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
h3 { font-size: 12pt; margin: 20px 0 6px; color: #333; }
h4 { font-size: 11pt; margin: 16px 0 4px; color: #444; }
p { margin: 0 0 12px; }
ul, ol { margin: 0 0 12px 24px; }
li { margin-bottom: 4px; }
code {
  font-family: 'Courier New', monospace;
  font-size: 9.5pt;
  background: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  padding: 1px 5px;
}
pre {
  background: #f4f4f4;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 0 0 14px;
  page-break-inside: avoid;
}
pre code { background: none; border: none; padding: 0; font-size: 9pt; }
blockquote {
  border-left: 3px solid #ccc;
  margin: 0 0 14px;
  padding: 4px 16px;
  color: #555;
  font-style: italic;
}
hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
em { font-style: italic; }
strong { font-weight: bold; }
a { color: #2563eb; text-decoration: underline; }
.meta { font-size: 9.5pt; color: #777; font-style: italic; margin-bottom: 24px; font-family: Arial, sans-serif; }
@media print {
  body { padding: 0; }
  a { color: #111; text-decoration: none; }
  pre, blockquote { page-break-inside: avoid; }
}
"""


@router.get("/print")
def print_file(path: str):
    safe_path = ROOT / path.lstrip("/")
    try:
        safe_path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        raise HTTPException(403, "Access denied")

    if not safe_path.exists() or not safe_path.is_file():
        raise HTTPException(404, "File not found")

    if safe_path.suffix != ".md":
        raise HTTPException(400, "Only markdown files can be exported")

    content = safe_path.read_text(encoding="utf-8", errors="replace")
    html_body = md_lib.markdown(content, extensions=["extra", "fenced_code", "tables"])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{safe_path.stem}</title>
<style>{PRINT_CSS}</style>
<script>window.onload = function() {{ window.print(); }}</script>
</head>
<body>
{html_body}
</body>
</html>"""

    return HTMLResponse(html)
