# SPDX-License-Identifier: AGPL-3.0-or-later
# MODE: sample = one 1 km tile (George Square); aoi = all Glasgow City + 500 m
MODE ?= sample
PORT ?= 8081
.PHONY: help setup lint test db-up db-down lod1 serve-tiles
help:
	@echo "targets: setup lint test db-up db-down lod1 serve-tiles  (lod1/serve-tiles take MODE=sample|aoi)"

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

# Serve tiles for the web viewers at http://localhost:$(PORT)/lod1/tileset.json
serve-tiles:
	npx --yes http-server build/$(MODE)/tiles -p $(PORT) --cors -c-1
