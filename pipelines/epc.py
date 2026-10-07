# SPDX-License-Identifier: AGPL-3.0-or-later
"""B5: Scottish domestic EPC register (data.gov.scot, OGL v3 for non-address fields) aggregated per building.

Only the UPRN, lodgement date, SAP score and assessment type are read: address columns (ADDRESS1-3, POSTCODE,
POSTTOWN) are never loaded, and `attrs.check_public_columns` fails the build if one ever reaches an output. The
UPRN is used for the join and then dropped. The newest certificate per UPRN counts; the rating is the SAP band of the
median score of the building's dwellings.
Output: part_epc.parquet (epc_count, epc_sap_median, epc_rating A-G, epc_latest_year).
"""

import subprocess

import pandas as pd

from . import config
from .download import fetch

URL = (
    "https://data.gov.scot/dataset/domestic_energy_performance_certificates___dataset_to_q1_2026"
    "/resource/5ebad3f5-c40e-4f80-b508-2c69712f0d25/download"
)
COLS = [
    "OSG_REFERENCE_NUMBER",
    "LODGEMENT_DATE",
    "CURRENT_ENERGY_EFFICIENCY",
    "LOCAL_AUTHORITY_LABEL",
]
SAP_BANDS = [(92, "A"), (81, "B"), (69, "C"), (55, "D"), (39, "E"), (21, "F"), (1, "G")]


def sap_band(score: float) -> str | None:
    """SAP 2012 energy efficiency band for a 1-100 score (A 92+, B 81-91, C 69-80, D 55-68, E 39-54, F 21-38, G 1-20)."""
    if pd.isna(score):
        return None
    return next((b for lo, b in SAP_BANDS if score >= lo), "G")


def read_all(folder) -> pd.DataFrame:
    parts = []
    for f in sorted(folder.glob("Q? 20??.csv")):
        d = pd.read_csv(f, usecols=COLS, dtype=str, encoding="utf-8-sig", encoding_errors="replace")
        parts.append(d.iloc[1:])  # row 1 of every file is a human-readable label row
    d = pd.concat(parts, ignore_index=True)
    d["UPRN"] = pd.to_numeric(d.OSG_REFERENCE_NUMBER, errors="coerce")
    d["sap"] = pd.to_numeric(d.CURRENT_ENERGY_EFFICIENCY, errors="coerce")
    d["lodged"] = pd.to_datetime(d.LODGEMENT_DATE, errors="coerce")
    return d.dropna(subset=["UPRN", "sap", "lodged"]).astype({"UPRN": "int64"})


def aggregate(certs: pd.DataFrame, xw: pd.DataFrame) -> pd.DataFrame:
    """certs: UPRN, sap, lodged; xw: UPRN, building_id. Newest certificate per UPRN, then per building."""
    c = certs.sort_values("lodged").drop_duplicates("UPRN", keep="last")
    c = c.merge(xw[["UPRN", "building_id"]], on="UPRN")
    g = c.groupby("building_id")
    out = pd.DataFrame(
        {
            "epc_count": g.size().astype("int32"),
            "epc_sap_median": g.sap.median().round(1),
            "epc_latest_year": g.lodged.max().dt.year.astype("int16"),
        }
    )
    out["epc_rating"] = out.epc_sap_median.map(sap_band)
    return out.reset_index()


def run(cfg: dict | None = None) -> pd.DataFrame:
    cfg = cfg or config.load()
    raw = config.resolve(cfg["analytics"]["raw_dir"]) / "epc"
    arch = fetch(URL, raw / "epc_scot.7z")
    if not any(raw.glob("Q? 20??.csv")):
        subprocess.run(["7z", "x", "-y", f"-o{raw}", str(arch)], check=True, capture_output=True)
    certs = read_all(raw)
    xw = pd.read_parquet(config.analytics_out(cfg) / "crosswalk.parquet")
    out = aggregate(certs, xw)
    out.to_parquet(config.analytics_out(cfg) / "part_epc.parquet", index=False)
    gl = certs[certs.LOCAL_AUTHORITY_LABEL == "Glasgow City"].UPRN.drop_duplicates()
    config.log(
        f"epc: {len(certs)} certificates; Glasgow City UPRNs {len(gl)}, in the crosswalk "
        f"{gl.isin(xw.UPRN).sum()} ({100 * gl.isin(xw.UPRN).mean():.1f}%); "
        f"{len(out)} buildings, ratings {out.epc_rating.value_counts().to_dict()}"
    )
    return out


if __name__ == "__main__":
    run()
