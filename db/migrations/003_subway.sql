-- Glasgow Subway static geometry (OSM railway=subway, ODbL; stations from NaPTAN, OGL). Positions are simulated on request.
create table ref.subway_track (
    circle text primary key check (circle in ('inner', 'outer')),
    geom   geometry(LineString, 4326) not null   -- one bore, in running direction
);
create table ref.subway_station (
    atco text primary key,
    name text not null,
    geom geometry(Point, 4326) not null
);
