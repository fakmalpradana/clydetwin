# SPDX-License-Identifier: AGPL-3.0-or-later
"""Open-Meteo UKMO: 3x3 grid over the AOI (same grid as the R2 archive), hourly."""

from datetime import UTC, datetime

from collectors.archive import OM_VARS, OPEN_METEO, grid_points
from collectors.common import Obs, Station, get_json

SOURCE = "open-meteo"
# Open-Meteo variable -> param. Wind is requested in m/s (the R2 archive holds km/h, see backfill).
PARAMS = {
    "temperature_2m": "temp_c",
    "precipitation": "precip_mm",
    "cloud_cover_low": "cloud_low",
    "cloud_cover_mid": "cloud_mid",
    "cloud_cover_high": "cloud_high",
    "wind_speed_10m": "wind_ms",
    "wind_direction_10m": "wind_dir",
}


def grid_id(i: int) -> str:
    return f"meteo:r{i // 3}c{i % 3}"


def stations() -> list[Station]:
    return [
        Station(
            id=grid_id(i),
            source=SOURCE,
            kind="weather",
            name=f"UKMO grid {lat:.2f}N {abs(lon):.2f}W",
            unit="°C",
            param="temp_c",
            interval_s=3600,
            lon=lon,
            lat=lat,
        )
        for i, (lat, lon) in enumerate(grid_points())
    ]


def parse(payload: list | dict, now: datetime | None = None) -> list[Obs]:
    """Hourly values per grid point. Hours after `now` are forecast, not observations: dropped."""
    now = now or datetime.now(UTC)
    payload = payload if isinstance(payload, list) else [payload]
    obs = []
    for i, loc in enumerate(payload):
        h = loc["hourly"]
        for j, t in enumerate(h["time"]):
            ts = datetime.fromisoformat(t).replace(tzinfo=UTC)
            if ts > now:
                continue
            for var, param in PARAMS.items():
                if h[var][j] is not None:
                    obs.append(Obs(station_id=grid_id(i), param=param, t=ts, value=h[var][j]))
    return obs


def collect():
    pts = grid_points()
    payload = get_json(
        OPEN_METEO,
        {
            "latitude": ",".join(str(p[0]) for p in pts),
            "longitude": ",".join(str(p[1]) for p in pts),
            "hourly": ",".join(OM_VARS),
            "models": "ukmo_seamless",
            "wind_speed_unit": "ms",
            "past_hours": 3,
            "forecast_hours": 1,
            "timezone": "UTC",
        },
    )
    return stations(), parse(payload)
