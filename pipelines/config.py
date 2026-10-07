# SPDX-License-Identifier: AGPL-3.0-or-later
"""Pipeline configuration: loads pipelines/config.yaml and resolves repo-relative paths."""

import os
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


def fresh(out: Path, *inputs: Path) -> bool:
    """True if `out` exists and is at least as new as all inputs."""
    if not out.exists():
        return False
    newest = max(p.stat().st_mtime for p in inputs)
    return out.stat().st_mtime >= newest


def partial(path: Path) -> Path:
    """Temp name for atomic writes: write here, then rename, so a killed run never leaves a 'valid' file."""
    return path.with_name(path.name + ".partial")


def log(msg: str) -> None:
    from datetime import datetime

    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def analytics_out(cfg: dict) -> Path:
    d = resolve(cfg["analytics"]["out_dir"])
    d.mkdir(parents=True, exist_ok=True)
    return d


def analytics_heights(cfg: dict) -> Path:
    """LoD1 building universe: heights.gpkg of the finished `make lod1 MODE=aoi` run (may live in another worktree)."""
    return (ROOT / os.environ.get("CLYDETWIN_HEIGHTS", cfg["analytics"]["heights"])).resolve()
