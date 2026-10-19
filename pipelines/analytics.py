# SPDX-License-Identifier: AGPL-3.0-or-later
"""`make analytics`: every per-building analytics module, then the assembled build/analytics/buildings_attrs.parquet."""

from . import attrs, crosswalk, epc, flood, heritage, noise, zones

if __name__ == "__main__":
    for m in (crosswalk, flood, noise, epc, heritage, zones):
        m.run()
    attrs.assemble()
