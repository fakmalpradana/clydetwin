# SPDX-License-Identifier: AGPL-3.0-or-later
"""Pipeline configuration: loads pipelines/config.yaml and resolves repo-relative paths."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def load(path: Path | None = None) -> dict:
    with open(path or ROOT / "pipelines" / "config.yaml") as f:
        return yaml.safe_load(f)


def resolve(rel: str) -> Path:
    return ROOT / rel
