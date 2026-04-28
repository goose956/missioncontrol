import yaml
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter()

WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"


def load_workflow(workflow_id: str) -> dict:
    path = WORKFLOWS_DIR / f"{workflow_id}.yaml"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


@router.get("")
def list_workflows():
    workflows = []
    for path in sorted(WORKFLOWS_DIR.glob("*.yaml")):
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        workflows.append({
            "id": path.stem,
            "name": data.get("name", path.stem),
            "description": data.get("description", ""),
            "icon": data.get("icon", "🤖"),
            "output_folder": data.get("output_folder", "shared/artifacts"),
            "auto_save": data.get("auto_save", True),
        })
    return workflows


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str):
    return load_workflow(workflow_id)
