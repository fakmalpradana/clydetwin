# Contributing

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) with a scope, e.g. `feat(pipeline): ...`,
  `fix(web): ...`, `docs(adr): ...`. The body explains *why*. One atomic commit per logical change; no WIP commits.
- **Pre-commit**: `uv run pre-commit install` once; hooks run ruff, ruff-format, gitleaks, large-file check (max 1 MB).
- **Never commit** data, tiles, `.env`, or files over 1 MB (`data/` and `build/` are gitignored).
- **Tests**: `uv run pytest` (Python), `uv run ruff check . && uv run ruff format --check .` (lint).
- Update `docs/PROGRESS.md` in the same commit as the task it tracks.
- Code is AGPL-3.0-or-later (add the SPDX header); data CC BY-SA 4.0; docs CC BY 4.0 (see `DATA_LICENSES.md`).

## Running the pipeline

Prerequisites: Docker (running), [uv](https://docs.astral.sh/uv/), GDAL command line tools (`brew install gdal` /
`apt install gdal-bin`), Node (only for `make serve-tiles`). Then:

```
cp .env.example .env
make setup
make lod1            # MODE=sample: one 1 km tile, a few minutes, ~100 MB of downloads cached in data/
make serve-tiles     # http://localhost:8081/lod1/tileset.json
make lod1 MODE=aoi   # all Glasgow City (13.4 GB LiDAR download)
```

## Live stack (Phase 2)

```
make live-up        # TimescaleDB (127.0.0.1:5434) + API (:8000) + collectors; needs LIVE_DB_PASSWORD in .env
make soak-report    # ingest gaps over the last 72 h (HOURS=24 for a shorter window)
make backfill       # import the R2 raw/ archive
uv run pytest       # API and collector tests need the live DB up (they use a throw-away clydetwin_test database)
```

See `deploy/README.md`. SEPA KiWIS is rate limited per IP: never loop requests against it; develop with fixtures.
