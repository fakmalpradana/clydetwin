# SPDX-License-Identifier: AGPL-3.0-or-later
"""Record the /immersive drone tour as a .webm, frame by frame.

Headless Chromium has no GPU (SwiftShader renders 1-2 fps), so real-time screen recording would be a slideshow.
Instead this pins the tour time (window.__tourT) for every output frame, waits for a few rendered frames so the
scene settles, screenshots, and encodes the PNGs with ffmpeg (VP9). Needs: pip install playwright, ffmpeg, and the
site running at BASE (npm run build && npx next start -p 3000; R2 CORS only allows localhost:3000).

Limits: in SwiftShader, tiles can still be streaming after a tour jump, so some frames may be black or half loaded
(a checked clip had a black frame at 12 s). Raise --settle, check frames before publishing, or record manually on a
real GPU (see README, "Demo clip").

  python3 scripts/capture-tour.py --seconds 25 --fps 12 --out ../docs/media/p5/drone-tour.webm
"""

import argparse
import asyncio
import pathlib
import subprocess
import tempfile

from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:3000")
ap.add_argument("--q", default="medium", help="quality preset: low | medium | high")
ap.add_argument("--seconds", type=float, default=25, help="clip length")
ap.add_argument("--fps", type=int, default=12)
ap.add_argument("--start", type=float, default=0, help="tour time (s) of the first frame")
ap.add_argument("--speed", type=float, default=2.2, help="tour seconds per clip second")
ap.add_argument("--settle", type=int, default=4, help="rendered frames to wait per output frame")
ap.add_argument("--t", default="2026-06-15T17:30:00Z", help="scene time (ISO); fixes the light")
ap.add_argument(
    "--wx", default="45,30,40,0", help="forced weather: low,mid,high cloud %%,precip mm/h"
)
ap.add_argument("--width", type=int, default=1280)
ap.add_argument("--height", type=int, default=720)
ap.add_argument("--out", default="../docs/media/p5/drone-tour.webm")
a = ap.parse_args()


async def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="tour-"))
    n = int(a.seconds * a.fps)
    async with async_playwright() as p:
        b = await p.chromium.launch(
            args=[
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
            ]
        )
        pg = await b.new_page(viewport={"width": a.width, "height": a.height})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(f"{a.base}/immersive?force=1&q={a.q}&mode=tour&t={a.t}&wx={a.wx}")
        await pg.add_style_tag(content="[data-chrome]{display:none!important}")
        await pg.evaluate(f"window.__tourT = {a.start}")
        await pg.wait_for_timeout(60000)  # tiles, terrain, clouds
        for i in range(n):
            await pg.evaluate(f"window.__tourT = {a.start + i / a.fps * a.speed}")
            f0 = await pg.evaluate("window.__frame || 0")
            await pg.wait_for_function(f"(window.__frame || 0) >= {f0 + a.settle}", timeout=120000)
            await pg.screenshot(path=str(tmp / f"{i:05d}.png"))
            if i % 25 == 0:
                print(f"frame {i}/{n}", flush=True)
        await b.close()
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-framerate",
            str(a.fps),
            "-i",
            str(tmp / "%05d.png"),
            "-c:v",
            "libvpx-vp9",
            "-crf",
            "36",
            "-b:v",
            "0",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ],
        check=True,
    )
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB), console errors: {len(errs)}")


asyncio.run(main())
