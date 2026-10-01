-- Soak report: ingest health over the last :hours hours (default 72). Run with `make soak-report [HOURS=72]`.
-- Acceptance: no gap longer than 2x the interval. Intervals below mirror collectors/common.py SOURCES.
\if :{?hours} \else \set hours 72 \endif

\echo == Per source: runs and gaps between successful runs (window :hours h)
with iv(source, interval_s) as (values ('open-meteo', 1800), ('uk-air', 1800), ('sepa', 900)),
w as (select * from meta.ingest_runs where started_at > now() - make_interval(hours => :hours)),
ok as (
  select source, finished_at,
         finished_at - lag(finished_at) over (partition by source order by finished_at) as gap
  from w where status = 'ok'
)
select iv.source,
       count(w.*) as runs,
       count(w.*) filter (where w.status = 'ok') as ok,
       count(w.*) filter (where w.status = 'error') as error,
       count(w.*) filter (where w.status = 'rate_limited') as rate_limited,
       max(w.finished_at) filter (where w.status = 'ok') as last_ok,
       date_trunc('second', now() - max(w.finished_at) filter (where w.status = 'ok')) as last_ok_age,
       date_trunc('second', (select max(gap) from ok where ok.source = iv.source)) as max_gap,
       (select count(*) from ok where ok.source = iv.source
          and gap > make_interval(secs => 2 * iv.interval_s)) as gaps_over_2x
from iv left join w using (source)
group by iv.source, iv.interval_s
order by iv.source;

\echo
\echo == Last error per source
select distinct on (source) source, started_at, status, left(error, 120) as error
from meta.ingest_runs where status in ('error', 'rate_limited')
order by source, started_at desc;

\echo
\echo == Observation series with a gap > 2x the station interval (empty = pass)
with o as (
  select station_id, param, t, t - lag(t) over (partition by station_id, param order by t) as gap
  from ts.observations where t > now() - make_interval(hours => :hours) and t <= now()
)
select o.station_id, o.param, count(*) as gaps, max(o.gap) as max_gap,
       make_interval(secs => 2 * s.interval_s) as limit
from o join ref.stations s on s.id = o.station_id
where o.gap > make_interval(secs => 2 * s.interval_s)
group by o.station_id, o.param, s.interval_s
order by max(o.gap) desc;

\echo
\echo == Rows per station kind in the window
select s.kind, count(distinct o.station_id) as stations, count(*) as rows,
       min(o.t) as first, max(o.t) as last
from ts.observations o join ref.stations s on s.id = o.station_id
where o.t > now() - make_interval(hours => :hours)
group by s.kind order by s.kind;
