# SPDX-License-Identifier: AGPL-3.0-or-later
.PHONY: help setup lint test db-up db-down
help:
	@echo "targets: setup lint test db-up db-down"

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
