# SPDX-License-Identifier: AGPL-3.0-or-later
"""EPC aggregation (newest certificate per UPRN, SAP band of the median) and the no-address schema guard."""

import pandas as pd
import pytest

from pipelines import attrs, epc


def test_sap_band_edges():
    assert [epc.sap_band(x) for x in (92, 91.9, 81, 69, 55, 39, 21, 20.9)] == list("ABBCDEFG")
    assert epc.sap_band(float("nan")) is None


def test_aggregate_newest_per_uprn_and_median():
    certs = pd.DataFrame(
        {
            "UPRN": [1, 1, 2, 3],
            "sap": [40.0, 70.0, 60.0, 80.0],
            "lodged": pd.to_datetime(["2018-01-01", "2024-05-01", "2020-01-01", "2021-01-01"]),
        }
    )
    xw = pd.DataFrame({"UPRN": [1, 2, 3, 9], "building_id": ["a", "a", "b", "c"]})
    out = epc.aggregate(certs, xw).set_index("building_id")
    assert out.loc["a", "epc_count"] == 2 and out.loc["a", "epc_sap_median"] == 65.0
    assert out.loc["a", "epc_rating"] == "D" and out.loc["a", "epc_latest_year"] == 2024
    assert out.loc["b", "epc_rating"] == "C" and "c" not in out.index
    attrs.check_public_columns(out.reset_index().columns)


@pytest.mark.parametrize(
    "col", ["ADDRESS1", "postcode", "UPRN", "osg_reference_number", "ngd_height", "bha_height"]
)
def test_schema_guard_rejects(col):
    with pytest.raises(ValueError):
        attrs.check_public_columns(["building_id", col])


def test_built_attrs_have_no_forbidden_columns():
    p = config_path()
    if not p.exists():
        pytest.skip("buildings_attrs.parquet not built")
    attrs.check_public_columns(pd.read_parquet(p).columns)


def config_path():
    from pipelines import config

    return config.resolve("build/analytics/buildings_attrs.parquet")
