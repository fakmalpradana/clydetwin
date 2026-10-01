# SPDX-License-Identifier: AGPL-3.0-or-later
"""Upload built tiles and terrain to Cloudflare R2 with the right headers.

Usage: python -m pipelines.publish build/aoi/tiles/lod1 lod1
       python -m pipelines.publish build/aoi/terrain terrain
"""

import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import boto3

# ponytail: re-uploads everything every run; add an ETag/size diff if uploads get slow.
IMMUTABLE = "public, max-age=31536000, immutable"
SHORT = "public, max-age=300"  # tileset.json / layer.json may change between releases


def headers(path: Path) -> dict:
    if path.suffix == ".terrain":
        # ctb writes gzip-compressed quantized-mesh; Cesium needs the encoding header.
        return {
            "ContentType": "application/vnd.quantized-mesh",
            "ContentEncoding": "gzip",
            "CacheControl": IMMUTABLE,
        }
    ctype = (
        {".glb": "model/gltf-binary", ".subtree": "application/octet-stream"}.get(path.suffix)
        or mimetypes.guess_type(path.name)[0]
        or "application/octet-stream"
    )
    cache = SHORT if path.suffix == ".json" else IMMUTABLE
    return {"ContentType": ctype, "CacheControl": cache}


def main(src: str, prefix: str) -> None:
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_DEFAULT_ENDPOINTS"].split()[0],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = os.environ["R2_BUCKET"]
    root = Path(src)
    files = [p for p in root.rglob("*") if p.is_file()]

    def put(p: Path) -> None:
        key = f"{prefix}/{p.relative_to(root).as_posix()}"
        s3.upload_file(str(p), bucket, key, ExtraArgs=headers(p))

    with ThreadPoolExecutor(32) as pool:
        for i, _ in enumerate(pool.map(put, files), 1):
            if i % 5000 == 0:
                print(f"{i}/{len(files)}", flush=True)
    print(f"uploaded {len(files)} files to {bucket}/{prefix}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
