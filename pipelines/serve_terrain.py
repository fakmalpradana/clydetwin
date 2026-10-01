# SPDX-License-Identifier: AGPL-3.0-or-later
"""Local static server for quantized-mesh tiles: the .terrain files are gzipped and need Content-Encoding."""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from . import config


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        if self.path.split("?")[0].endswith(".terrain"):
            self.send_header("Content-Encoding", "gzip")
        super().end_headers()

    def guess_type(self, path):
        return (
            "application/vnd.quantized-mesh"
            if path.endswith(".terrain")
            else super().guess_type(path)
        )


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "aoi"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8083
    d = config.build_dir(mode) / "terrain"
    print(f"serving {d} at http://localhost:{port}/layer.json")
    ThreadingHTTPServer(("", port), partial(Handler, directory=str(d))).serve_forever()
