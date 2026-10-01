# Contributing

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) with a scope, e.g. `feat(pipeline): ...`,
  `fix(web): ...`, `docs(adr): ...`. The body explains *why*. One atomic commit per logical change; no WIP commits.
- **Pre-commit**: `uv run pre-commit install` once; hooks run ruff, ruff-format, gitleaks, large-file check (max 1 MB).
- **Never commit** data, tiles, `.env`, or files over 1 MB (`data/` and `build/` are gitignored).
- **Tests**: `uv run pytest` (Python), `uv run ruff check . && uv run ruff format --check .` (lint).
- Update `docs/PROGRESS.md` in the same commit as the task it tracks.
- Code is AGPL-3.0-or-later (add the SPDX header); data CC BY-SA 4.0; docs CC BY 4.0 (see `DATA_LICENSES.md`).
