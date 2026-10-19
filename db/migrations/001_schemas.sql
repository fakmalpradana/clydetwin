-- Schemas, station reference table and ingest log.
create extension if not exists timescaledb;
create extension if not exists postgis;

create schema if not exists ref;
create schema if not exists ts;
create schema if not exists meta;

-- One row per station. `param` is the primary parameter used for "latest" and status.
create table ref.stations (
    id          text primary key,              -- sepa:<ts_id>, meteo:<grid>, aq:<site>
    source      text not null,                 -- open-meteo | sepa | uk-air
    kind        text not null check (kind in ('river_level', 'rainfall', 'weather', 'air_quality')),
    name        text not null,
    unit        text not null,
    param       text not null default 'value',
    interval_s  integer not null,              -- expected sampling interval; stale when older than 2x
    high        double precision,              -- optional status thresholds (river levels)
    alert       double precision,
    geom        geometry(Point, 4326) not null
);
create index on ref.stations using gist (geom);

create table meta.ingest_runs (
    id          bigint generated always as identity primary key,
    source      text not null,
    started_at  timestamptz not null default now(),
    finished_at timestamptz,
    status      text not null default 'running' check (status in ('running', 'ok', 'error', 'rate_limited')),
    n_rows      integer,
    error       text
);
create index on meta.ingest_runs (source, started_at desc);
