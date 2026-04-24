# Coder Workspace

**Agent:** Software Engineer (Coder subgraph)
**Model tier:** Intermediate (Haiku / Flash via OpenRouter)

## Inputs
- Implementation plans from Planner
- Bug reports, feature specs

## Outputs → `shared/artifacts/code/`
- Source code
- Unit tests
- PR descriptions

## Tools available
- File read/write
- Bash (restricted)
- Git operations

## Conventions
- New features branch from `main` as `feat/<slug>`
- Tests co-located with source (`test_*.py`)
