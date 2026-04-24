# Planner Workspace

**Agent:** Strategic Coordinator (Supervisor subgraph)
**Model tier:** Elite (Sonnet)

## Inputs
- User goal statements (natural language)
- Task queues from other agents

## Outputs → `shared/artifacts/plans/`
- Implementation plans (Markdown)
- Task queues (JSON)
- Milestone tracking files

## Tools available
- Web search (Tavily)
- File read/write
- Delegate to: Coder, Documents, Ideas

## Conventions
- All plans named `PLAN_YYYYMMDD_<slug>.md`
- Task items use `[ ]` / `[x]` checkboxes
