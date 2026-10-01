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


def lidar_tiles(cfg: dict, mode: str, kind: str) -> list[Path]:
    """Local DSM/DTM GeoTIFFs for a run mode ('sample' = 1 km windows, 'aoi' = full tiles)."""
    raw = resolve(cfg["lidar"]["raw_dir"])
    folder = raw / "sample" if mode == "sample" else raw / kind
    tiles = sorted(folder.glob(f"{kind}_*.tif" if mode == "sample" else "*.tif"))
    if not tiles:
        raise FileNotFoundError(
            f"no {kind} tiles in {folder}; run `python -m pipelines.lidar {mode}`"
        )
    return tiles


def build_dir(mode: str) -> Path:
    d = ROOT / "build" / mode
    d.mkdir(parents=True, exist_ok=True)
    return d
