-- LoD1 extrusion + analytics attributes for pg2b3dm (lod1 from lod1.sql, attrs_src loaded from the analytics CSV).
-- Tile metadata has no nulls: text without a value is 'none', numbers without a value are -1.
-- real/int4 only (pg2b3dm 2.27 mis-aligns 8-byte metadata buffers).
DROP TABLE IF EXISTS lod1_attrs;
CREATE TABLE lod1_attrs AS
SELECT l.*,
       a.volume_m3::real AS volume_m3,
       a.storeys_est::int AS storeys_est,
       COALESCE(NULLIF(a.flood_river, ''), 'none') AS flood_river,
       COALESCE(NULLIF(a.flood_coastal, ''), 'none') AS flood_coastal,
       COALESCE(NULLIF(a.flood_surface, ''), 'none') AS flood_surface,
       COALESCE(NULLIF(a.flood_max, ''), 'none') AS flood_max,
       COALESCE(a.noise_lden_db, -1)::real AS noise_lden_db,
       COALESCE(NULLIF(a.noise_band, ''), 'none') AS noise_band,
       COALESCE(a.epc_count, 0)::int AS epc_count,
       COALESCE(a.epc_sap_median, -1)::real AS epc_sap_median,
       COALESCE(NULLIF(a.epc_rating, ''), 'none') AS epc_rating,
       COALESCE(NULLIF(a.lb_category, ''), 'none') AS lb_category,
       COALESCE(a.conservation_area, 0)::int AS conservation_area,
       COALESCE(NULLIF(a.data_zone, ''), 'none') AS data_zone
FROM lod1 l LEFT JOIN attrs_src a USING (building_id);
CREATE INDEX ON lod1_attrs USING gist (geom);
