CREATE OR REPLACE VIEW v_traffic_observation AS
SELECT o.*, s.sensor_code, s.source_kind AS sensor_kind,
       rs.segment_id, r.road_id, r.road_name, a.area_name AS area
FROM traffic_observation o
JOIN sensor s ON s.sensor_id = o.sensor_id
JOIN road_segment rs ON rs.segment_id = s.segment_id
JOIN road r ON r.road_id = rs.road_id
JOIN area a ON a.area_id = r.area_id;
CREATE OR REPLACE VIEW v_daily_road_summary AS
SELECT import_id, road_id, road_name, area, observation_date,
       COUNT(*) AS reading_count, SUM(vehicle_count) AS total_volume,
       AVG(average_speed) AS average_speed,
       SUM(congestion_level = 'High') AS high_readings
FROM v_traffic_observation
GROUP BY import_id, road_id, road_name, area, observation_date;
CREATE OR REPLACE VIEW v_congestion_report AS
SELECT import_id, road_id, road_name, area, congestion_level,
       COUNT(*) AS reading_count, SUM(vehicle_count) AS total_volume,
       AVG(average_speed) AS average_speed
FROM v_traffic_observation
GROUP BY import_id, road_id, road_name, area, congestion_level;
