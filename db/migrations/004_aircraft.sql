-- Aircraft around EGPF (adsb.lol, ODbL: keep this layer separate). 30-day retention, then dropped by the policy.
create table ts.aircraft_positions (
    hex         text not null,                 -- ICAO 24-bit address, the vehicle id
    t           timestamptz not null,          -- time of the position fix
    lon         double precision not null,
    lat         double precision not null,
    h_ellip_m   double precision not null,     -- ellipsoidal height, see docs/decisions/ADR-008-aircraft-source.md
    h_src       text not null check (h_src in ('geom', 'baro', 'ground')),
    callsign    text,
    heading_deg double precision,
    speed_ms    double precision,
    on_ground   boolean not null default false,
    primary key (hex, t)
);
select create_hypertable('ts.aircraft_positions', 't', chunk_time_interval => interval '1 day');
select add_retention_policy('ts.aircraft_positions', interval '30 days');

-- Simple EGPF events derived from consecutive fixes.
create table ts.airport_events (
    t        timestamptz not null,
    hex      text not null,
    callsign text,
    kind     text not null check (kind in ('arrival', 'departure')),
    airport  text not null default 'EGPF',
    primary key (hex, t, kind)
);
