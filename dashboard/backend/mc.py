#!/usr/bin/env python3
"""
Mission Control CLI  —  mc.py
==============================
Agent-accessible interface to every Mission Control function.

All commands have a --json flag for clean machine-readable output.
Human-facing output uses Rich tables. Agent output is JSON to stdout.

Quick start:
  python mc.py --help
  python mc.py ideas list --json
  python mc.py chat run --workflow spec-bot --message "..." --json
  python mc.py spec --idea-id abc123 --json
"""

import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Bootstrap paths ───────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

import typer
import yaml
from rich import box
from rich.console import Console
from rich.table import Table

# ── App structure ─────────────────────────────────────────────────────────────

app = typer.Typer(
    name="mc",
    help="Mission Control — agent-accessible CLI.\n\nEvery command supports --json for automation.",
    no_args_is_help=True,
    rich_markup_mode="rich",
)
ideas_app    = typer.Typer(help="Manage ideas in the Ideas Lab.",   no_args_is_help=True)
projects_app = typer.Typer(help="Manage projects.",                  no_args_is_help=True)
files_app    = typer.Typer(help="Browse and read workspace files.",  no_args_is_help=True)
chat_app     = typer.Typer(help="Run workflow chats with Claude.",   no_args_is_help=True)

app.add_typer(ideas_app,    name="ideas")
app.add_typer(projects_app, name="projects")
app.add_typer(files_app,    name="files")
app.add_typer(chat_app,     name="chat")

console = Console()
err     = Console(stderr=True)

# ── Data paths ────────────────────────────────────────────────────────────────

IDEAS_FILE    = ROOT / "workspaces" / "ideas"    / "ideas.json"
PROJECTS_FILE = ROOT / "workspaces" / "projects" / "projects.json"
WORKFLOWS_DIR = Path(__file__).parent / "workflows"

WATCHED_FOLDERS = [
    "shared/specs",
    "shared/artifacts",
    "shared/exports",
    "workspaces/planner",
    "workspaces/coder",
    "workspaces/ideas",
    "workspaces/projects",
    "workspaces/documents",
    "workspaces/media",
    "workspaces/landing-pages",
]

# ── Local model config ────────────────────────────────────────────────────────

LOCAL_MODEL     = "qwen2.5"
OLLAMA_BASE_URL = "http://localhost:11434/v1"

# ── Helpers ───────────────────────────────────────────────────────────────────

def _out(data, as_json: bool) -> None:
    """Output data as JSON (agent) or let caller handle rich display (human)."""
    if as_json:
        typer.echo(json.dumps(data, indent=2, ensure_ascii=False, default=str))


def _load_json(path: Path) -> list:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def _load_workflow(workflow_id: str) -> dict:
    path = WORKFLOWS_DIR / f"{workflow_id}.yaml"
    if not path.exists():
        err.print(f"[red]Error:[/red] Workflow '{workflow_id}' not found.")
        err.print("Run [bold]mc chat workflows[/bold] to see available workflows.")
        raise typer.Exit(1)
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _anthropic_client():
    import anthropic
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        err.print("[red]Error:[/red] ANTHROPIC_API_KEY not set. Check your .env file.")
        raise typer.Exit(1)
    return anthropic.Anthropic(api_key=key)


def _local_client():
    """Return an OpenAI-compatible client pointing at the local Ollama server."""
    from openai import OpenAI
    import httpx
    try:
        httpx.get(f"{OLLAMA_BASE_URL}/models", timeout=2)
    except Exception:
        err.print("[red]Error:[/red] Cannot reach Ollama at localhost:11434.")
        err.print("Start it with: [bold]ollama serve[/bold]")
        err.print("Install from: [bold]https://ollama.com/download[/bold]")
        raise typer.Exit(1)
    return OpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")


def _llm_complete(prompt: str, system: str = "", local: bool = False, max_tokens: int = 1024) -> str:
    """Single-turn LLM call. Routes to Ollama (local=True) or Anthropic."""
    if local:
        client = _local_client()
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = client.chat.completions.create(
            model=LOCAL_MODEL,
            messages=messages,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content.strip()
    else:
        client = _anthropic_client()
        kwargs = dict(
            model="claude-opus-4-7",
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        if system:
            kwargs["system"] = system
        resp = client.messages.create(**kwargs)
        return resp.content[0].text.strip()


def _find_by_prefix(items: list, id_prefix: str, label: str = "item") -> dict:
    match = next((i for i in items if i["id"].startswith(id_prefix)), None)
    if not match:
        err.print(f"[red]Error:[/red] No {label} found with ID starting with '{id_prefix}'")
        raise typer.Exit(1)
    return match


# ═══════════════════════════════════════════════════════════════════════════════
# IDEAS
# ═══════════════════════════════════════════════════════════════════════════════

@ideas_app.command("list")
def ideas_list(
    status:   Optional[str] = typer.Option(None, "--status",   "-s", help="Filter: draft | working | complete | archived"),
    category: Optional[str] = typer.Option(None, "--category", "-c", help="Filter: saas | skill | landing-page | ad-ideas | misc"),
    json_output: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """List all ideas sorted by rank (priority)."""
    ideas = sorted(_load_json(IDEAS_FILE), key=lambda x: x.get("rank", 9999))
    if status:
        ideas = [i for i in ideas if i.get("status") == status]
    if category:
        ideas = [i for i in ideas if i.get("category") == category]

    if json_output:
        _out(ideas, True)
        return

    if not ideas:
        console.print("[dim]No ideas found.[/dim]")
        return

    status_style = {"draft": "dim", "working": "yellow", "complete": "green", "archived": "dim italic"}
    cat_style    = {"saas": "blue", "skill": "magenta", "landing-page": "orange3", "ad-ideas": "red", "misc": "dim"}

    table = Table(box=box.ROUNDED, header_style="bold cyan")
    table.add_column("#",        width=4,  style="dim")
    table.add_column("Title",    min_width=22)
    table.add_column("Category", width=14)
    table.add_column("Status",   width=10)
    table.add_column("Created",  width=12)
    table.add_column("ID",       width=10, style="dim")

    for idea in ideas:
        ss = status_style.get(idea.get("status", ""), "dim")
        cs = cat_style.get(idea.get("category", ""), "dim")
        table.add_row(
            str(idea.get("rank", "-")),
            idea.get("title", ""),
            f"[{cs}]{idea.get('category', '')}[/{cs}]",
            f"[{ss}]{idea.get('status', '')}[/{ss}]",
            idea.get("created_at", "")[:10],
            idea.get("id", "")[:8],
        )

    console.print(table)
    console.print(f"[dim]{len(ideas)} idea(s)[/dim]")


@ideas_app.command("create")
def ideas_create(
    title:       str           = typer.Option(...,    "--title",       "-t"),
    category:    str           = typer.Option("misc", "--category",    "-c", help="saas | skill | landing-page | ad-ideas | misc"),
    description: str           = typer.Option(...,    "--description", "-d"),
    status:      str           = typer.Option("draft","--status",      "-s", help="draft | working | complete"),
    json_output: bool          = typer.Option(False,  "--json"),
):
    """Create a new idea."""
    ideas = _load_json(IDEAS_FILE)
    idea  = {
        "id":          str(uuid.uuid4()),
        "rank":        len(ideas) + 1,
        "title":       title,
        "category":    category,
        "description": description,
        "status":      status,
        "created_at":  datetime.now().isoformat(),
        "updated_at":  datetime.now().isoformat(),
    }
    ideas.append(idea)
    _save_json(IDEAS_FILE, ideas)

    if json_output:
        _out(idea, True)
    else:
        console.print(f"[green]✓[/green] Created [bold]{title}[/bold]  ID: [dim]{idea['id'][:8]}[/dim]")


@ideas_app.command("update")
def ideas_update(
    idea_id:     str           = typer.Argument(help="Idea ID (full or 8-char prefix)"),
    title:       Optional[str] = typer.Option(None, "--title"),
    description: Optional[str] = typer.Option(None, "--description", "-d"),
    status:      Optional[str] = typer.Option(None, "--status",      "-s"),
    category:    Optional[str] = typer.Option(None, "--category",    "-c"),
    json_output: bool          = typer.Option(False, "--json"),
):
    """Update an existing idea."""
    ideas = _load_json(IDEAS_FILE)
    idea  = _find_by_prefix(ideas, idea_id, "idea")

    if title:       idea["title"]       = title
    if description: idea["description"] = description
    if status:      idea["status"]      = status
    if category:    idea["category"]    = category
    idea["updated_at"] = datetime.now().isoformat()
    _save_json(IDEAS_FILE, ideas)

    if json_output:
        _out(idea, True)
    else:
        console.print(f"[green]✓[/green] Updated [bold]{idea['title']}[/bold]")


@ideas_app.command("delete")
def ideas_delete(
    idea_id: str  = typer.Argument(help="Idea ID (full or 8-char prefix)"),
    yes:     bool = typer.Option(False, "--yes", "-y", help="Skip confirmation prompt"),
):
    """Delete an idea."""
    ideas = _load_json(IDEAS_FILE)
    idea  = _find_by_prefix(ideas, idea_id, "idea")

    if not yes:
        typer.confirm(f"Delete '{idea['title']}'?", abort=True)

    ideas = [i for i in ideas if i["id"] != idea["id"]]
    for idx, i in enumerate(sorted(ideas, key=lambda x: x.get("rank", 9999)), 1):
        i["rank"] = idx
    _save_json(IDEAS_FILE, ideas)
    console.print(f"[red]✗[/red] Deleted [bold]{idea['title']}[/bold]")


@ideas_app.command("rewrite")
def ideas_rewrite(
    idea_id:     str  = typer.Argument(help="Idea ID (full or 8-char prefix)"),
    apply:       bool = typer.Option(False, "--apply", help="Save the rewrite back to the idea"),
    local:       bool = typer.Option(False, "--local", help="Use local Ollama model instead of Claude"),
    json_output: bool = typer.Option(False, "--json"),
):
    """AI-rewrite an idea's description (Claude or local Ollama)."""
    ideas = _load_json(IDEAS_FILE)
    idea  = _find_by_prefix(ideas, idea_id, "idea")

    category_labels = {
        "saas": "SaaS product", "skill": "Claude Code skill",
        "landing-page": "landing page", "ad-ideas": "ad / marketing idea", "misc": "general idea",
    }
    label = category_labels.get(idea["category"], idea["category"])

    if not json_output:
        model_label = f"[dim]{LOCAL_MODEL}[/dim]" if local else "[dim]Claude[/dim]"
        err.print(f"[dim]Rewriting '{idea['title']}' via {model_label}…[/dim]")

    prompt = (
        f"Rewrite this {label} idea into a compelling 2–3 sentence description. "
        f"Be specific, punchy, and clear about the value proposition. "
        f"Output only the improved description — no preamble.\n\n"
        f"Original: {idea['description']}"
    )
    rewritten = _llm_complete(prompt, local=local, max_tokens=300)

    if apply:
        idea["description"] = rewritten
        idea["updated_at"]  = datetime.now().isoformat()
        _save_json(IDEAS_FILE, ideas)

    if json_output:
        _out({"id": idea["id"], "title": idea["title"], "rewritten": rewritten, "applied": apply}, True)
    else:
        console.print(f"\n[bold cyan]Rewritten description:[/bold cyan]\n{rewritten}\n")
        if apply:
            console.print("[green]✓[/green] Saved to idea")
        else:
            console.print("[dim]Tip: pass --apply to save this back to the idea.[/dim]")


# ═══════════════════════════════════════════════════════════════════════════════
# PROJECTS
# ═══════════════════════════════════════════════════════════════════════════════

@projects_app.command("list")
def projects_list(
    status:      Optional[str] = typer.Option(None,  "--status", "-s", help="Filter by status"),
    json_output: bool          = typer.Option(False, "--json"),
):
    """List all projects."""
    projects = _load_json(PROJECTS_FILE)
    if status:
        projects = [p for p in projects if p.get("status") == status]

    if json_output:
        _out(projects, True)
        return

    if not projects:
        console.print("[dim]No projects found.[/dim]")
        return

    status_style = {"draft": "dim", "active": "green", "blocked": "red", "complete": "blue", "archived": "dim italic"}

    table = Table(box=box.ROUNDED, header_style="bold cyan")
    table.add_column("Title",   min_width=22)
    table.add_column("Status",  width=10)
    table.add_column("Spec",    min_width=24)
    table.add_column("Files",   width=6)
    table.add_column("Created", width=12)
    table.add_column("ID",      width=10, style="dim")

    for p in projects:
        ss = status_style.get(p.get("status", ""), "dim")
        table.add_row(
            p.get("title", ""),
            f"[{ss}]{p.get('status', '')}[/{ss}]",
            p.get("spec_path") or "[dim]—[/dim]",
            str(len(p.get("files", []))),
            p.get("created_at", "")[:10],
            p.get("id", "")[:8],
        )

    console.print(table)
    console.print(f"[dim]{len(projects)} project(s)[/dim]")


@projects_app.command("create")
def projects_create(
    title:       str           = typer.Option(...,       "--title",       "-t"),
    description: str           = typer.Option("",        "--description", "-d"),
    status:      str           = typer.Option("draft",   "--status",      "-s", help="draft | active | blocked | complete"),
    idea_id:     Optional[str] = typer.Option(None,      "--idea-id",           help="Link to an idea ID"),
    spec_path:   Optional[str] = typer.Option(None,      "--spec",              help="Relative path to spec .md file"),
    json_output: bool          = typer.Option(False,     "--json"),
):
    """Create a new project, optionally linked to an idea and spec."""
    projects = _load_json(PROJECTS_FILE)
    project  = {
        "id":          str(uuid.uuid4()),
        "title":       title,
        "description": description,
        "status":      status,
        "idea_id":     idea_id,
        "spec_path":   spec_path,
        "files":       [],
        "created_at":  datetime.now().isoformat(),
        "updated_at":  datetime.now().isoformat(),
    }
    projects.append(project)
    _save_json(PROJECTS_FILE, projects)

    if json_output:
        _out(project, True)
    else:
        console.print(f"[green]✓[/green] Created project [bold]{title}[/bold]  ID: [dim]{project['id'][:8]}[/dim]")


@projects_app.command("update")
def projects_update(
    project_id:  str           = typer.Argument(help="Project ID (full or 8-char prefix)"),
    title:       Optional[str] = typer.Option(None, "--title"),
    description: Optional[str] = typer.Option(None, "--description", "-d"),
    status:      Optional[str] = typer.Option(None, "--status",      "-s"),
    spec_path:   Optional[str] = typer.Option(None, "--spec"),
    json_output: bool          = typer.Option(False, "--json"),
):
    """Update a project."""
    projects = _load_json(PROJECTS_FILE)
    project  = _find_by_prefix(projects, project_id, "project")

    if title:       project["title"]       = title
    if description: project["description"] = description
    if status:      project["status"]      = status
    if spec_path:   project["spec_path"]   = spec_path
    project["updated_at"] = datetime.now().isoformat()
    _save_json(PROJECTS_FILE, projects)

    if json_output:
        _out(project, True)
    else:
        console.print(f"[green]✓[/green] Updated project [bold]{project['title']}[/bold]")


@projects_app.command("show")
def projects_show(
    project_id:  str  = typer.Argument(help="Project ID (full or 8-char prefix)"),
    json_output: bool = typer.Option(False, "--json"),
):
    """Show full details of a project."""
    projects = _load_json(PROJECTS_FILE)
    project  = _find_by_prefix(projects, project_id, "project")

    if json_output:
        _out(project, True)
        return

    console.print(f"\n[bold]{project['title']}[/bold]  [dim]{project['id'][:8]}[/dim]")
    console.print(f"Status:      {project.get('status', '—')}")
    console.print(f"Description: {project.get('description') or '—'}")
    console.print(f"Spec:        {project.get('spec_path') or '—'}")
    console.print(f"Idea ID:     {project.get('idea_id') or '—'}")
    console.print(f"Files:       {len(project.get('files', []))}")
    console.print(f"Created:     {project.get('created_at', '')[:16]}\n")


# ═══════════════════════════════════════════════════════════════════════════════
# FILES
# ═══════════════════════════════════════════════════════════════════════════════

@files_app.command("list")
def files_list(
    folder:      Optional[str] = typer.Option(None,  "--folder", "-f", help="Filter to one folder (e.g. shared/specs)"),
    ext:         Optional[str] = typer.Option(None,  "--ext",          help="Filter by extension (e.g. .md)"),
    json_output: bool          = typer.Option(False, "--json"),
):
    """List files across all watched workspace folders."""
    results = []
    folders = [folder] if folder else WATCHED_FOLDERS

    for f in folders:
        folder_path = ROOT / f
        if not folder_path.exists():
            continue
        for file in sorted(folder_path.rglob("*")):
            if not file.is_file() or file.name.startswith("."):
                continue
            if ext and file.suffix.lower() != ext.lower():
                continue
            rel = str(file.relative_to(ROOT)).replace("\\", "/")
            results.append({
                "name":     file.name,
                "path":     rel,
                "folder":   f,
                "size_kb":  round(file.stat().st_size / 1024, 1),
                "modified": datetime.fromtimestamp(file.stat().st_mtime).isoformat()[:16],
            })

    results.sort(key=lambda x: x["modified"], reverse=True)

    if json_output:
        _out(results, True)
        return

    if not results:
        console.print("[dim]No files found.[/dim]")
        return

    table = Table(box=box.ROUNDED, header_style="bold cyan")
    table.add_column("Name",     min_width=28)
    table.add_column("Folder",   min_width=22)
    table.add_column("Size",     width=8)
    table.add_column("Modified", width=16)

    for f in results:
        table.add_row(f["name"], f["folder"], f"{f['size_kb']} KB", f["modified"])

    console.print(table)
    console.print(f"[dim]{len(results)} file(s)[/dim]")


@files_app.command("read")
def files_read(
    path: str = typer.Argument(help="Relative file path (e.g. shared/specs/myspec.md)"),
):
    """Print the raw contents of a workspace file to stdout."""
    safe_path = ROOT / path.lstrip("/")
    try:
        safe_path.resolve().relative_to(ROOT.resolve())
    except ValueError:
        err.print("[red]Error:[/red] Path traversal denied")
        raise typer.Exit(1)

    if not safe_path.exists():
        err.print(f"[red]Error:[/red] Not found: {path}")
        raise typer.Exit(1)

    typer.echo(safe_path.read_text(encoding="utf-8", errors="replace"))


# ═══════════════════════════════════════════════════════════════════════════════
# CHAT / WORKFLOWS
# ═══════════════════════════════════════════════════════════════════════════════

@chat_app.command("workflows")
def chat_workflows(json_output: bool = typer.Option(False, "--json")):
    """List all available workflow configurations."""
    workflows = []
    for p in sorted(WORKFLOWS_DIR.glob("*.yaml")):
        with open(p, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        workflows.append({
            "id":            p.stem,
            "name":          data.get("name", p.stem),
            "description":   data.get("description", ""),
            "model":         data.get("model", "claude-opus-4-7"),
            "output_folder": data.get("output_folder", "shared/artifacts"),
        })

    if json_output:
        _out(workflows, True)
        return

    table = Table(box=box.ROUNDED, header_style="bold cyan")
    table.add_column("ID",          width=16)
    table.add_column("Name",        width=22)
    table.add_column("Description", min_width=32)
    table.add_column("Output",      min_width=24)

    for w in workflows:
        table.add_row(w["id"], w["name"], w["description"], w["output_folder"])

    console.print(table)


@chat_app.command("run")
def chat_run(
    workflow:    str           = typer.Option(...,    "--workflow", "-w", help="Workflow ID (e.g. spec-bot, coder, research)"),
    message:     str           = typer.Option(...,    "--message",  "-m", help="Message to send"),
    save:        bool          = typer.Option(True,   "--save/--no-save", help="Auto-save conversation output"),
    local:       bool          = typer.Option(False,  "--local", help="Use local Ollama model instead of Claude"),
    json_output: bool          = typer.Option(False,  "--json"),
):
    """
    Run a single-turn workflow chat with Claude or a local Ollama model.

    Output is saved to the workflow's configured folder unless --no-save is used.
    Use --json to get a machine-readable response for agent pipelines.

    Example:
      mc chat run --workflow research --message "Analyse the no-code SaaS market" --json
      mc chat run --workflow coder --message "Review this function" --local --json
    """
    wf = _load_workflow(workflow)

    if not json_output:
        model_label = LOCAL_MODEL if local else wf.get("model", "claude-opus-4-7")
        err.print(f"[dim]Running [bold]{wf.get('name', workflow)}[/bold] via {model_label}…[/dim]")

    system = wf.get("system_prompt", "You are a helpful assistant.")
    text   = _llm_complete(message, system=system, local=local, max_tokens=8096)

    saved_path = None
    if save and text:
        output_dir = ROOT / wf.get("output_folder", "shared/artifacts")
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath   = output_dir / f"{wf.get('id', workflow)}_{timestamp}.md"
        model_used = LOCAL_MODEL if local else wf.get("model", "claude-opus-4-7")
        doc = (
            f"# {wf.get('name', workflow)}\n\n"
            f"*{datetime.now().strftime('%Y-%m-%d %H:%M')}*  \n"
            f"*Model: {model_used}*\n\n---\n\n"
            f"**User**\n\n{message}\n\n---\n\n"
            f"**Assistant**\n\n{text}\n"
        )
        filepath.write_text(doc, encoding="utf-8")
        saved_path = str(filepath.relative_to(ROOT)).replace("\\", "/")

    if json_output:
        _out({
            "workflow":   workflow,
            "response":   text,
            "saved_path": saved_path,
            "model":      LOCAL_MODEL if local else wf.get("model", "claude-opus-4-7"),
            "local":      local,
        }, True)
    else:
        console.print(f"\n{text}\n")
        if saved_path:
            console.print(f"[green]✓[/green] Saved → [dim]{saved_path}[/dim]")


# ═══════════════════════════════════════════════════════════════════════════════
# SPEC SHORTCUT
# ═══════════════════════════════════════════════════════════════════════════════

@app.command("spec")
def spec_from_idea(
    idea_id:     str           = typer.Option(...,   "--idea-id", help="Idea ID to generate a spec from (full or 8-char prefix)"),
    extra:       Optional[str] = typer.Option(None,  "--message", "-m", help="Extra context to include alongside the idea"),
    local:       bool          = typer.Option(False, "--local", help="Use local Ollama model instead of Claude"),
    json_output: bool          = typer.Option(False, "--json"),
):
    """
    Generate a spec document from a saved idea using the spec-bot workflow.

    Loads the idea by ID, builds a structured prompt, and runs it through
    spec-bot. The finished spec is saved to shared/specs/ automatically.

    Example:
      mc spec --idea-id abc12345 --json
    """
    ideas = _load_json(IDEAS_FILE)
    idea  = _find_by_prefix(ideas, idea_id, "idea")
    wf    = _load_workflow("spec-bot")

    prompt = (
        f"I have an idea I'd like to turn into a software specification.\n\n"
        f"**Title:** {idea['title']}\n"
        f"**Category:** {idea['category']}\n"
        f"**Description:** {idea['description']}"
    )
    if extra:
        prompt += f"\n\n**Additional context:** {extra}"
    prompt += (
        "\n\nPlease ask me the questions you need to produce a complete spec, "
        "or if you already have enough, write the full specification document now."
    )

    if not json_output:
        model_label = LOCAL_MODEL if local else "Claude"
        err.print(f"[dim]Generating spec for [bold]{idea['title']}[/bold] via {model_label}…[/dim]")

    text = _llm_complete(prompt, system=wf.get("system_prompt", ""), local=local, max_tokens=8096)

    output_dir = ROOT / "shared" / "specs"
    output_dir.mkdir(parents=True, exist_ok=True)
    slug      = "".join(c if c.isalnum() else "-" for c in idea["title"].lower())[:40].strip("-")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath  = output_dir / f"spec_{slug}_{timestamp}.md"
    doc = (
        f"# Spec: {idea['title']}\n\n"
        f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*  \n"
        f"*Idea ID: `{idea['id']}`*\n\n---\n\n"
        f"{text}\n"
    )
    filepath.write_text(doc, encoding="utf-8")
    saved_path = str(filepath.relative_to(ROOT)).replace("\\", "/")

    if json_output:
        _out({
            "idea_id":    idea["id"],
            "idea_title": idea["title"],
            "response":   text,
            "saved_path": saved_path,
        }, True)
    else:
        console.print(f"\n{text}\n")
        console.print(f"[green]✓[/green] Spec saved → [dim]{saved_path}[/dim]")


# ═══════════════════════════════════════════════════════════════════════════════
# LOCAL MODELS
# ═══════════════════════════════════════════════════════════════════════════════

@app.command("models")
def list_models(json_output: bool = typer.Option(False, "--json")):
    """List locally available Ollama models."""
    import httpx
    try:
        resp = httpx.get(f"{OLLAMA_BASE_URL}/models", timeout=3)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        err.print("[red]Error:[/red] Cannot reach Ollama at localhost:11434.")
        err.print("Install from: [bold]https://ollama.com/download[/bold]")
        err.print("Then run:     [bold]ollama pull qwen2.5[/bold]")
        raise typer.Exit(1)

    models = [m["id"] for m in data.get("data", [])]

    if json_output:
        _out(models, True)
        return

    if not models:
        console.print("[dim]No local models found. Run: [bold]ollama pull qwen2.5[/bold][/dim]")
        return

    table = Table(box=box.ROUNDED, header_style="bold cyan")
    table.add_column("Model", min_width=30)
    for m in models:
        table.add_row(m)
    console.print(table)
    console.print(f"[dim]Use with [bold]--local[/bold] on: ideas rewrite, chat run, spec[/dim]")


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app()
