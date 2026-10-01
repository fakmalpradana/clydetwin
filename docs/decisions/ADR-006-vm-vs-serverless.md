# ADR-006: One small VM for the live backend (not serverless)

Status: accepted (Phase 2). Licence: CC BY 4.0.

## Context

Phase 2 adds weather, river, rainfall and air-quality history served over an API. Needs: a time-series store with
compression, collectors that run every 15 to 30 minutes, a small read API, and a nightly off-box copy. Budget about
£5/month; one maintainer.

## Options

1. **Serverless** (Vercel/Cloudflare functions + a hosted Postgres or D1/KV, GitHub Actions cron for ingest).
   No server to patch, but: cron granularity and drift on Actions (the P1 archive already shows delays and
   per-IP 429s on shared runner IPs), no TimescaleDB compression on free tiers, cold starts, and the data layer
   would be a second paid service anyway.
2. **One VM (Hetzner CX22, Docker Compose)**: TimescaleDB + PostGIS, FastAPI, a loop scheduler, Caddy for TLS.
   A stable IP matters for SEPA (rate limit per IP) and for the access request to SEPA KiWIS.

## Decision

Option 2. Everything is in `docker-compose.live.yml`; all services use `restart: unless-stopped` and Docker starts
at boot, so there is nothing else to supervise. State lives in one volume; the collectors also dump each UTC day to
R2 (`dump/observations/`), and the Actions archive to R2 `raw/` keeps running, so losing the VM loses no history.
The stack is proven locally first (`make live-up`, `make soak-report`); the VM is the same compose file.

## Consequences

- Patching and backups are ours: unattended-upgrades on the host, image bumps by `make live-up`.
- Single point of failure. Accepted: the site (tiles on R2/Vercel) still works; `/live` shows stale badges.
- Revisit if traffic outgrows 2 vCPU or if a managed Timescale tier becomes free.
