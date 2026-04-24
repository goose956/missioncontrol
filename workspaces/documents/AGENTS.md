# Documents Workspace

**Agent:** Technical Writer (Documents subgraph)
**Model tier:** Intermediate

## Inputs
- Specs from `shared/specs/` (Markdown)
- User briefs

## Outputs → `shared/exports/`
- PDF specifications (WeasyPrint)
- User guides
- Client deliverables

## Tools available
- WeasyPrint (HTML→PDF)
- File read/write

## Conventions
- Source specs in Markdown, rendered to PDF on demand
- PDFs named `SPEC_<project>_v<n>.pdf`
