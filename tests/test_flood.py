# SPDX-License-Identifier: AGPL-3.0-or-later
"""Flood exposure classing: likelihood precedence and worst-of-sources."""

import pandas as pd

from pipelines import flood


def test_flood_classify_precedence_and_worst():
    h = pd.Series([True, False, False, False])
    m = pd.Series([True, True, False, False])
    lo = pd.Series([True, True, True, False])
    assert flood.classify(h, m, lo).tolist() == ["high", "medium", "low", "none"]
    a, b = pd.Series(["none", "low"]), pd.Series(["medium", "none"])
    assert flood.worst(a, b).tolist() == ["medium", "low"]
