# SPDX-License-Identifier: AGPL-3.0-or-later
import pandas as pd

from pipelines import attrs


def test_storeys_heuristic():
    s = attrs.storeys(pd.Series([2.0, 3.0, 4.4, 7.5, 70.6]), 3.0)
    assert s.tolist() == [1, 1, 1, 2, 24]  # at least one storey, nearest whole number
