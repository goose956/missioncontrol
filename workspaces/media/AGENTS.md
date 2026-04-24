# Media Workspace

**Agent:** Creative Director (Media subgraph)
**Model tier:** Intermediate

## Inputs
- Screen recordings (Screenpipe / external drive)
- Raw footage paths

## Outputs → `shared/artifacts/media/`
- Indexed media records (SQLite)
- Highlight clips
- SKILL.md files extracted from recordings
- Video transcripts

## Tools available
- pymediainfo (indexing)
- Screenpipe REST API (search history)
- MoviePy (future — clip editing)

## Conventions
- Media index at `memory/sqlite/media_index.db`
- SKILL.md files written to `skills/` root
