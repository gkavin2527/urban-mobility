-- MySQL 8.0.18+; run inside the dedicated urban_mobility database.
-- No source data is invented. Derived sensors are logical dataset locations.
CREATE TABLE IF NOT EXISTS dataset_import (
  import_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_sha256 CHAR(64) NOT NULL UNIQUE,
  source_file VARCHAR(255) NOT NULL,
  source_url VARCHAR(512) NOT NULL,
  source_version VARCHAR(40) NOT NULL DEFAULT '1',
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  input_rows INT UNSIGNED NOT NULL,
  accepted_rows INT UNSIGNED NOT NULL,
  rejected_rows INT UNSIGNED NOT NULL,
  duplicate_rows INT UNSIGNED NOT NULL,
  min_date DATE NOT NULL,
  max_date DATE NOT NULL,
  quality_report JSON NOT NULL
);
CREATE TABLE IF NOT EXISTS area (
  area_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  area_name VARCHAR(160) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS road (
  road_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  area_id INT UNSIGNED NOT NULL,
  road_name VARCHAR(160) NOT NULL,
  city VARCHAR(40) NOT NULL DEFAULT 'Bengaluru',
  UNIQUE KEY uq_road_area (area_id,road_name),
  CONSTRAINT fk_road_area FOREIGN KEY (area_id) REFERENCES area(area_id)
);
CREATE TABLE IF NOT EXISTS road_segment (
  segment_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  road_id INT UNSIGNED NOT NULL UNIQUE,
  segment_name VARCHAR(160) NOT NULL,
  source_kind VARCHAR(40) NOT NULL DEFAULT 'dataset location',
  CONSTRAINT fk_segment_road FOREIGN KEY (road_id) REFERENCES road(road_id)
);
CREATE TABLE IF NOT EXISTS sensor (
  sensor_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  segment_id INT UNSIGNED NOT NULL UNIQUE,
  sensor_code VARCHAR(40) NOT NULL UNIQUE,
  source_kind VARCHAR(40) NOT NULL DEFAULT 'logical dataset location',
  CONSTRAINT fk_sensor_segment FOREIGN KEY (segment_id) REFERENCES road_segment(segment_id)
);
CREATE TABLE IF NOT EXISTS vehicle (
  vehicle_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_type VARCHAR(30) NOT NULL,
  source_reference VARCHAR(160) NULL
);
CREATE TABLE IF NOT EXISTS trip (
  trip_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  source_location VARCHAR(160) NOT NULL,
  destination VARCHAR(160) NOT NULL,
  CONSTRAINT fk_trip_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id),
  CONSTRAINT ck_trip_time CHECK (end_time > start_time)
);
CREATE TABLE IF NOT EXISTS traffic_observation (
  observation_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  import_id BIGINT UNSIGNED NOT NULL,
  sensor_id INT UNSIGNED NOT NULL,
  source_row INT UNSIGNED NOT NULL,
  observation_date DATE NOT NULL,
  time_block VARCHAR(20) NOT NULL,
  vehicle_count INT NOT NULL,
  average_speed DECIMAL(12,5) NOT NULL,
  congestion_level VARCHAR(10) NOT NULL,
  travel_time_index DECIMAL(12,5) NULL,
  capacity_utilization DECIMAL(12,5) NULL,
  incident_reports INT NULL,
  environmental_impact DECIMAL(18,8) NULL,
  public_transport_usage DECIMAL(12,5) NULL,
  signal_compliance DECIMAL(12,5) NULL,
  parking_usage DECIMAL(12,5) NULL,
  pedestrian_count INT NULL,
  weather VARCHAR(64) NULL,
  roadwork BOOLEAN NULL,
  traffic_situation VARCHAR(40) NULL,
  source_data JSON NOT NULL,
  UNIQUE KEY uq_import_source_row (import_id,source_row),
  INDEX idx_obs_sensor_date (sensor_id,observation_date),
  INDEX idx_obs_import_date (import_id,observation_date),
  CONSTRAINT fk_obs_import FOREIGN KEY (import_id) REFERENCES dataset_import(import_id),
  CONSTRAINT fk_obs_sensor FOREIGN KEY (sensor_id) REFERENCES sensor(sensor_id),
  CONSTRAINT ck_obs_counts CHECK (vehicle_count >= 0 AND (incident_reports IS NULL OR incident_reports >= 0) AND (pedestrian_count IS NULL OR pedestrian_count >= 0)),
  CONSTRAINT ck_obs_speed CHECK (average_speed >= 0),
  CONSTRAINT ck_obs_congestion CHECK (congestion_level IN ('Low','Medium','High')),
  CONSTRAINT ck_obs_time CHECK (time_block IN ('Midnight','Morning','Daytime','Noon','Evening','Night')),
  CONSTRAINT ck_obs_percentages CHECK ((capacity_utilization IS NULL OR capacity_utilization BETWEEN 0 AND 100) AND (public_transport_usage IS NULL OR public_transport_usage BETWEEN 0 AND 100) AND (signal_compliance IS NULL OR signal_compliance BETWEEN 0 AND 100) AND (parking_usage IS NULL OR parking_usage BETWEEN 0 AND 100))
);
CREATE TABLE IF NOT EXISTS app_state (
  singleton_id TINYINT PRIMARY KEY,
  active_import_id BIGINT UNSIGNED NULL,
  summary_refreshed_at DATETIME(6) NULL,
  CONSTRAINT ck_state_singleton CHECK (singleton_id = 1),
  CONSTRAINT fk_state_import FOREIGN KEY (active_import_id) REFERENCES dataset_import(import_id)
);
INSERT IGNORE INTO app_state (singleton_id) VALUES (1);
CREATE TABLE IF NOT EXISTS road_daily_summary (
  import_id BIGINT UNSIGNED NOT NULL,
  road_id INT UNSIGNED NOT NULL,
  observation_date DATE NOT NULL,
  reading_count INT UNSIGNED NOT NULL,
  total_volume BIGINT UNSIGNED NOT NULL,
  average_speed DECIMAL(15,6) NOT NULL,
  high_readings INT UNSIGNED NOT NULL,
  PRIMARY KEY (import_id,road_id,observation_date),
  CONSTRAINT fk_summary_import FOREIGN KEY (import_id) REFERENCES dataset_import(import_id),
  CONSTRAINT fk_summary_road FOREIGN KEY (road_id) REFERENCES road(road_id)
);
