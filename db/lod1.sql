-- LoD1 extrusion of building footprints for pg2b3dm.
-- Input : buildings_src (loaded by ogr2ogr, EPSG:27700, one row per building, attributes from heights.py)
-- Output: lod1 (WGS84/ETRS89 geometry, Z = ellipsoidal height). Base = ground_z_ellip, top = base + height.
-- Geometry is a MultiPolygonZ of outward-facing walls plus a flat roof (no floor: never seen from below).
-- ponytail: no SFCGAL in the stock PostGIS image, so walls are built by hand; ceiling = flat roofs only (LoD2 in Phase 4).
DROP TABLE IF EXISTS lod1;
CREATE TABLE lod1 AS
WITH b AS (
  -- real/int4 (not float8/int8): pg2b3dm 2.27 mis-aligns 8-byte metadata buffers, which fails the 3D Tiles validator.
  SELECT building_id, height::real AS height, h_max::real AS h_max, ground_z_odn::real AS ground_z_odn,
         ground_z_ellip::real AS ground_z_ellip, area_m2::real AS area_m2, height_source, lidar_year::int AS lidar_year,
         ST_Transform(ST_ForcePolygonCCW(ST_Force2D(geom)), 4326) AS g
  FROM buildings_src
  WHERE NOT ST_IsEmpty(geom) AND ST_GeometryType(geom) = 'ST_Polygon'
), walls AS (
  SELECT b.building_id,
         ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[
           ST_MakePoint(ST_X(ST_StartPoint(s.geom)), ST_Y(ST_StartPoint(s.geom)), b.ground_z_ellip),
           ST_MakePoint(ST_X(ST_EndPoint(s.geom)),   ST_Y(ST_EndPoint(s.geom)),   b.ground_z_ellip),
           ST_MakePoint(ST_X(ST_EndPoint(s.geom)),   ST_Y(ST_EndPoint(s.geom)),   b.ground_z_ellip + b.height),
           ST_MakePoint(ST_X(ST_StartPoint(s.geom)), ST_Y(ST_StartPoint(s.geom)), b.ground_z_ellip + b.height),
           ST_MakePoint(ST_X(ST_StartPoint(s.geom)), ST_Y(ST_StartPoint(s.geom)), b.ground_z_ellip)
         ])), 4326) AS face
  FROM b, LATERAL ST_DumpSegments(b.g) AS s
  WHERE ST_Length(s.geom) > 0
), roofs AS (
  SELECT building_id,
         ST_Translate(ST_Force3DZ(g, ground_z_ellip), 0, 0, height) AS face
  FROM b
)
SELECT b.building_id, b.height, b.h_max, b.ground_z_odn, b.ground_z_ellip, b.area_m2,
       b.height_source, b.lidar_year,
       ST_SetSRID(ST_Collect(ARRAY(
         SELECT face FROM walls w WHERE w.building_id = b.building_id
         UNION ALL SELECT face FROM roofs r WHERE r.building_id = b.building_id)), 4326) AS geom
FROM b;
CREATE INDEX ON lod1 USING gist (geom);
