# SPDX-License-Identifier: AGPL-3.0-or-later
# MODE: sample = one 1 km tile (George Square); aoi = all Glasgow City + 500 m
MODE ?= sample
PORT ?= 8081
# Published tiles live under lod1/$(TILE_VERSION)/ and terrain/$(TILE_VERSION)/ (immutable caching; bump on rebuild)
TILE_VERSION ?= v1
.PHONY: r2-version-copy live-up live-down live-logs soak-report migrate backfill help setup lint test db-up db-down lod1 terrain tiles publish-lod1 serve-tiles serve-terrain publish
help:
	@echo "targets: setup lint test db-up db-down lod1 terrain serve-tiles serve-terrain publish  (lod1/serve-tiles take MODE=sample|aoi)"

setup:
	uv sync
	uv run pre-commit install

lint:
	uv run ruff check . && uv run ruff format --check .

test:
	uv run pytest

db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

# End to end: download -> rasters -> footprints -> heights -> PostGIS -> pg2b3dm -> validate.
# Output: build/$(MODE)/tiles/lod1/tileset.json. Needs docker, GDAL CLI, uv (see CONTRIBUTING.md).
lod1: db-up
	uv run python -m pipelines.lod1 $(MODE)

# Own quantized-mesh terrain from the LiDAR DTM (ellipsoidal heights): build/$(MODE)/terrain/layer.json.
# Run `make lod1` first for the rasters. Check: uv run python -m pipelines.terrain_check $(MODE)
terrain:
	uv run python -m pipelines.terrain $(MODE)
	uv run python -m pipelines.terrain_check $(MODE)

# Serve tiles for the web viewers at http://localhost:$(PORT)/lod1/tileset.json
serve-tiles:
	npx --yes http-server build/$(MODE)/tiles -p $(PORT) --cors -c-1

# Serve terrain at http://localhost:8083/layer.json (adds the Content-Encoding header the gzipped tiles need)
serve-terrain:
	uv run python -m pipelines.serve_terrain $(MODE) 8083

# Rebuild only the 3D Tiles from existing build/$(MODE)/heights.gpkg (PostGIS, pg2b3dm, validator)
tiles: db-up
	uv run python -m pipelines.tiles $(MODE)

# Upload only the LoD1 tiles (to lod1/$(TILE_VERSION)/)
publish-lod1:
	set -a; . ./.env; set +a; uv run python -m pipelines.publish build/$(MODE)/tiles/lod1 lod1/$(TILE_VERSION)

# Upload MODE tiles + terrain to Cloudflare R2 (needs R2_* in .env)
publish:
	set -a; . ./.env; set +a; \
	uv run python -m pipelines.publish build/$(MODE)/tiles/lod1 lod1/$(TILE_VERSION) && \
	uv run python -m pipelines.publish build/$(MODE)/terrain terrain/$(TILE_VERSION)

# ---- Phase 2 live stack (see deploy/README.md) ----
LIVE = docker compose -f docker-compose.live.yml

# db + api (runs migrations) + collectors; + Caddy/TLS when DOMAIN in .env is not localhost
live-up:
	set -a; . ./.env; set +a; \
	$(LIVE) $$([ "$${DOMAIN:-localhost}" != localhost ] && echo --profile edge) up -d --build --wait

live-down:
	$(LIVE) --profile edge down

live-logs:
	$(LIVE) logs -f --tail=100 api collectors

# Ingest soak check over the last HOURS (default 72): runs, gaps > 2x interval, last errors
HOURS ?= 72
soak-report:
	$(LIVE) exec -T db psql -U clydetwin -d clydetwin -v hours=$(HOURS) -f - < db/soak_report.sql

# Apply db/migrations/*.sql to DATABASE_URL (the api container also does this at start)
migrate:
	set -a; . ./.env; set +a; uv run python -m db.migrate

# Import the R2 raw/ archive into the live DB (idempotent). Runs in the collectors image: no uv needed on the VM.
backfill:
	$(LIVE) run --rm --no-deps collectors python -m collectors.backfill

# One-off: server-side copy of the unversioned P1 objects (lod1/, terrain/) into the v1 prefixes
r2-version-copy:
	set -a; . ./.env; set +a; \
	uv run python -m pipelines.publish --copy lod1 lod1/$(TILE_VERSION) && \
	uv run python -m pipelines.publish --copy terrain terrain/$(TILE_VERSION)
