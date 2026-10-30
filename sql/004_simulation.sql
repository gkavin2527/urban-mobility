-- Synthetic, reproducible junction runs live in their own tables.
-- Historical Kaggle observations are never overwritten or merged with them.
CREATE TABLE IF NOT EXISTS simulation_run (
  run_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comparison_group CHAR(36) NOT NULL,
  scenario VARCHAR(40) NOT NULL,
  control_mode ENUM('fixed','adaptive') NOT NULL,
  demand_seed INT UNSIGNED NOT NULL,
  demand_fingerprint CHAR(64) NOT NULL,
  duration_seconds SMALLINT UNSIGNED NOT NULL,
  status ENUM('queued','running','completed','stopped','failed') NOT NULL DEFAULT 'queued',
  sim_second SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total_arrived INT UNSIGNED NOT NULL DEFAULT 0,
  total_served INT UNSIGNED NOT NULL DEFAULT 0,
  total_wait_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_queue INT UNSIGNED NOT NULL DEFAULT 0,
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  error_message VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  started_at DATETIME(6) NULL,
  finished_at DATETIME(6) NULL,
  heartbeat_at DATETIME(6) NULL,
  UNIQUE KEY uq_simulation_group_mode (comparison_group,control_mode),
  INDEX idx_simulation_status (status,heartbeat_at),
  INDEX idx_simulation_created (created_at),
  CONSTRAINT ck_simulation_duration CHECK (duration_seconds BETWEEN 60 AND 360),
  CONSTRAINT ck_simulation_totals CHECK (total_served <= total_arrived)
);

CREATE TABLE IF NOT EXISTS simulation_step (
  run_id BIGINT UNSIGNED NOT NULL,
  sim_second SMALLINT UNSIGNED NOT NULL,
  active_phase ENUM('NS','EW') NOT NULL,
  signal_state ENUM('green','yellow','all_red') NOT NULL,
  queue_total INT UNSIGNED NOT NULL,
  total_arrived INT UNSIGNED NOT NULL,
  total_served INT UNSIGNED NOT NULL,
  total_wait_seconds BIGINT UNSIGNED NOT NULL,
  max_queue INT UNSIGNED NOT NULL,
  vehicle_state JSON NOT NULL,
  recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (run_id,sim_second),
  CONSTRAINT fk_sim_step_run FOREIGN KEY (run_id) REFERENCES simulation_run(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS simulation_lane_sample (
  run_id BIGINT UNSIGNED NOT NULL,
  sim_second SMALLINT UNSIGNED NOT NULL,
  approach CHAR(1) NOT NULL,
  queue_length INT UNSIGNED NOT NULL,
  arrivals_total INT UNSIGNED NOT NULL,
  served_total INT UNSIGNED NOT NULL,
  PRIMARY KEY (run_id,sim_second,approach),
  INDEX idx_sim_lane_approach (run_id,approach,sim_second),
  CONSTRAINT fk_sim_lane_step FOREIGN KEY (run_id,sim_second) REFERENCES simulation_step(run_id,sim_second) ON DELETE CASCADE,
  CONSTRAINT ck_sim_approach CHECK (approach IN ('N','S','E','W'))
);

CREATE TABLE IF NOT EXISTS simulation_action (
  action_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id BIGINT UNSIGNED NOT NULL,
  sim_second SMALLINT UNSIGNED NOT NULL,
  from_phase ENUM('NS','EW') NOT NULL,
  to_phase ENUM('NS','EW') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  current_queue INT UNSIGNED NOT NULL,
  opposing_queue INT UNSIGNED NOT NULL,
  INDEX idx_sim_action_timeline (run_id,sim_second),
  CONSTRAINT fk_sim_action_run FOREIGN KEY (run_id) REFERENCES simulation_run(run_id) ON DELETE CASCADE,
  CONSTRAINT ck_sim_action_change CHECK (from_phase <> to_phase)
);
