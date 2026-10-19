# Environmental data archive (task 1.13)

`collectors/archive.py`, run every 15 minutes by `.github/workflows/archive.yml` (also `workflow_dispatch`).
Each run writes one gzipped NDJSON object per source to R2:

`raw/{source}/{YYYY}/{MM}/{DD}/{HHMM}.ndjson.gz` (UTC, HHMM rounded down to the 15-minute slot)

| Source | Content | Window per run |
|---|---|---|
| `sepa_kiwis` | SEPA KiWIS 15-minute river level and rainfall for stations inside the Glasgow AOI bbox (`collectors/sepa_stations.json`, regenerated with `--refresh-stations`) | last 2 h |
| `open_meteo_ukmo` | Open-Meteo `ukmo_seamless` hourly: temperature, precipitation, cloud cover low/mid/high, wind, on a 3x3 grid over the AOI bbox | 3 h back, 3 h ahead |

Windows overlap on purpose so a missed run loses nothing; deduplicate on `(ts_id, timestamp)` or `(lat, lon, time)`
when reading. Every record carries `fetched_at`. A failing source does not stop the other; the run exits non-zero so
the Actions tab shows it.

Secrets (repository owner sets them): `R2_ACCOUNT_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
Locally the script falls back to `R2_DEFAULT_ENDPOINTS` from `.env`. Data licences: SEPA OGL v3, Open-Meteo CC BY 4.0
(source UK Met Office); see `DATA_LICENSES.md`.

Glasgow SCOOT traffic counts are not archived yet: the Glasgow developer portal key is not available. It will be added
as a third source with the same object layout once the key exists.

## Live DB (Phase 2)

`make backfill` (`collectors/backfill.py`) loads these `raw/` objects into the live TimescaleDB; re-running inserts
nothing new. Archived Open-Meteo wind is km/h and is converted to m/s on import; forecast hours are skipped. SEPA
records are imported only for series already in `ref.stations` (the archive has no coordinates).
The collectors container also writes `dump/observations/YYYY/MM/DD.ndjson.gz` (previous UTC day, rows of
`ts.observations`) to the same bucket once a day when `R2_*` is set, so the VM history is never only on the VM.
