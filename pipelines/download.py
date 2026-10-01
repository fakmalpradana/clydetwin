# SPDX-License-Identifier: AGPL-3.0-or-later
"""Resumable HTTP download with size check and a sha256 manifest."""

import hashlib
from pathlib import Path

import requests


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path, expected_size: int | None = None) -> Path:
    """Download url to dest, resuming a partial file. Records sha256 in <dir>/SHA256SUMS."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    if dest.exists() and (expected_size is None or dest.stat().st_size == expected_size):
        return dest
    start = part.stat().st_size if part.exists() else 0
    headers = {"Range": f"bytes={start}-"} if start else {}
    with requests.get(url, headers=headers, stream=True, timeout=60) as r:
        if r.status_code == 416:  # already complete
            start = 0
        else:
            r.raise_for_status()
        mode = "ab" if r.status_code == 206 else "wb"
        with open(part, mode) as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    if expected_size is not None and part.stat().st_size != expected_size:
        raise OSError(
            f"size mismatch for {dest.name}: got {part.stat().st_size}, want {expected_size}"
        )
    part.rename(dest)
    with open(dest.parent / "SHA256SUMS", "a") as f:
        f.write(f"{sha256(dest)}  {dest.name}\n")
    return dest
