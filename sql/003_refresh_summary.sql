-- MySQL has no native materialized views. This procedure refreshes a summary
-- table transactionally. It is not presented as CREATE MATERIALIZED VIEW.
DROP PROCEDURE IF EXISTS refresh_traffic_summary;
DELIMITER $$
CREATE PROCEDURE refresh_traffic_summary()
BEGIN
  DECLARE selected_import BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;
  SELECT active_import_id INTO selected_import FROM app_state WHERE singleton_id = 1 FOR UPDATE;
  IF selected_import IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Import the source dataset first';
  END IF;
  DELETE FROM road_daily_summary WHERE import_id = selected_import;
  INSERT INTO road_daily_summary (import_id,road_id,observation_date,reading_count,total_volume,average_speed,high_readings)
    SELECT import_id,road_id,observation_date,reading_count,total_volume,average_speed,high_readings
    FROM v_daily_road_summary WHERE import_id = selected_import;
  UPDATE app_state SET summary_refreshed_at = UTC_TIMESTAMP(6) WHERE singleton_id = 1;
  COMMIT;
END$$
DELIMITER ;
