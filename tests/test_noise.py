# SPDX-License-Identifier: AGPL-3.0-or-later
"""Noise banding."""

import numpy as np
import pandas as pd

from pipelines import noise


def test_noise_band_edges():
    db = pd.Series([0.0, 49.9, 50.0, 54.9, 55.0, 69.9, 70.0, 75.0, 88.0, np.nan])
    assert noise.band(db).tolist()[:-1] == [
        "<50", "<50", "50-54", "50-54", "55-59", "65-69", "70-74", "75+", "75+",
    ]  # fmt: skip
    assert pd.isna(noise.band(db).iloc[-1])
