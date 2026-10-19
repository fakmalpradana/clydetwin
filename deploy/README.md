# Deploy kit: live backend on one VM

Everything runs from `docker-compose.live.yml` (TimescaleDB + PostGIS, API, collectors, Caddy for TLS). See
`docs/decisions/ADR-006-vm-vs-serverless.md`. **Prove it locally first** (below); the VM only repeats the same steps.

## 0. Local first (this is what the 72 h soak runs)

```
cp .env.example .env      # set LIVE_DB_PASSWORD (and DATABASE_URL to match), keep DOMAIN=localhost
make live-up              # db + api + collectors; migrations run when the api starts
curl localhost:8000/api/v1/health
make backfill             # needs R2_* in .env
make soak-report          # HOURS=72 by default
make live-logs            # follow api + collectors; make live-down to stop (data volume is kept)
```

## 1. Rent and prepare the VM (Fairuz)

1. Hetzner Cloud: CX22 (2 vCPU, 4 GB RAM, ~EUR 4-5/month), Ubuntu 24.04, add your SSH key, location Helsinki or
   Nuremberg. Note the IPv4 address, e.g. `203.0.113.7`.
2. Public hostname: use `203-0-113-7.sslip.io` (dashes instead of dots) as `DOMAIN`, or your own domain with an A
   record to the IP. Caddy gets the certificate automatically.
3. SSH in as root, then:
   ```
   apt-get update && apt-get -y upgrade
   apt-get -y install make git ufw unattended-upgrades
   curl -fsSL https://get.docker.com | sh          # official Docker install script
   systemctl enable --now docker                   # containers restart on boot (restart: unless-stopped)
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```
   (The DB is bound to 127.0.0.1 only; do not open 5434.)

## 2. Install and start

```
git clone https://github.com/fakmalpradana/clydetwin.git && cd clydetwin
git checkout main          # or the release tag
cp .env.example .env && nano .env
```

Set in `.env` (never commit it):

| Key | Value |
|---|---|
| `LIVE_DB_PASSWORD` | a long random password (`openssl rand -hex 24`); `DATABASE_URL` only matters for host tools |
| `DOMAIN` | `203-0-113-7.sslip.io` (your IP with dashes) or your domain |
| `CORS_ORIGINS`, `CORS_ORIGIN_REGEX` | defaults already allow localhost:3000, clydetwin.vercel.app and *.vercel.app |
| `LIVE_SOURCES` | `open-meteo,uk-air` now; add `,sepa` only after SEPA grants KiWIS access |
| `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_DEFAULT_ENDPOINTS` | same as local; enables the daily dump and `make backfill` |
| `HC_PING_OPEN_METEO`, `HC_PING_UK_AIR`, `HC_PING_SEPA` | Healthchecks.io ping URLs (optional) |

```
make live-up                                   # builds images, starts everything incl. Caddy (DOMAIN != localhost)
curl https://203-0-113-7.sslip.io/api/v1/health
make backfill                                  # import the R2 raw/ archive written since P1
```

Then set `NEXT_PUBLIC_API_URL=https://203-0-113-7.sslip.io` in Vercel and redeploy the web.

## 3. Monitoring

- **UptimeRobot**: HTTPS monitor on `https://<DOMAIN>/api/v1/health`, 5-minute interval. The endpoint returns 200
  when the DB is up (even if a source is stale; look at `status`) and 503 when the DB is down. For a stricter
  monitor use "keyword exists" `"status":"ok"`.
- **Healthchecks.io**: one check per source (period 30 min for open-meteo/uk-air, 15 min for sepa, grace 30 min);
  paste each ping URL into `.env` and `make live-up` again.
- **Ingest soak**: `make soak-report` (any window: `HOURS=24 make soak-report`). Acceptance: `gaps_over_2x` is 0 and
  the series-gap table is empty over 72 h.

## 4. Operate

| Task | Command |
|---|---|
| Logs | `make live-logs` |
| Update | `git pull && make live-up` (rebuilds, migrations run when the api starts) |
| Stop | `make live-down` (volumes kept) |
| DB shell | `docker compose -f docker-compose.live.yml exec db psql -U clydetwin` |
| Restore history | `make backfill` (R2 `raw/`); daily DB dumps are in R2 `dump/observations/YYYY/MM/DD.ndjson.gz` |
| Idle RAM check | `free -m` and `docker stats --no-stream` (target under 60% of 4 GB) |

Restart behaviour: every service has `restart: unless-stopped`; Docker starts on boot, so a reboot brings the stack
back without a unit file.
