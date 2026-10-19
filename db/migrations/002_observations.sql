-- Time series: hypertable with 30-day chunks, compressed after 30 days.
create table ts.observations (
    station_id text not null,
    param      text not null default 'value',
    t          timestamptz not null,
    value      double precision not null,
    primary key (station_id, param, t)
);
select create_hypertable('ts.observations', 't', chunk_time_interval => interval '30 days');
alter table ts.observations set (timescaledb.compress, timescaledb.compress_segmentby = 'station_id, param');
select add_compression_policy('ts.observations', interval '30 days');
