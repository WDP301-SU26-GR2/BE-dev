# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Project skills live in `.claude/skills/` (currently: `backend-development` — NestJS/API
  design, auth, testing, security, performance, DevOps references). Mirrored from the
  shared `.agents/skills/` so other tools (Codex, Cursor, ...) can use the same skill.
- Project permissions: `.claude/settings.local.json`.
- `AGENTS.md` above is the single source of truth for project rules (architecture, layer
  responsibilities, naming, error handling, migration checklist). Codex and Cursor read
  that file natively — only Claude-specific mechanics belong in this file.
