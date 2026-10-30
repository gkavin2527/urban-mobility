# SQL guide for the ASQL review

Use MySQL Workbench connected to the configured `urban_mobility` database. The application runs the same saved queries with an active import ID and bound filter values; the snippets below are study examples that can be adapted for Workbench.

The synthetic junction has separate run, sample, lane, and action tables. Its Workbench examples are in [SIMULATION_GUIDE.md](SIMULATION_GUIDE.md).

## Check the connected database and loaded tables

```sql
SELECT VERSION() AS mysql_version, DATABASE() AS database_name;

SELECT d.import_id, d.source_file, d.accepted_rows, d.rejected_rows,
       d.min_date, d.max_date, d.source_sha256
FROM app_state AS s
JOIN dataset_import AS d ON d.import_id = s.active_import_id
WHERE s.singleton_id = 1;

SELECT COUNT(*) AS observations,
       COUNT(DISTINCT sensor_id) AS logical_locations,
       COUNT(DISTINCT observation_date) AS observed_dates
FROM traffic_observation;
```

`vehicle` and `trip` are empty extension tables because the selected source contains aggregate rows, not individual vehicle or trip identities.

## Join and aggregate

```sql
SELECT a.area_name, r.road_name,
       SUM(o.vehicle_count) AS recorded_volume,
       ROUND(AVG(o.average_speed), 2) AS mean_source_speed,
       COUNT(*) AS source_readings
FROM traffic_observation AS o
JOIN sensor AS s ON s.sensor_id = o.sensor_id
JOIN road_segment AS rs ON rs.segment_id = s.segment_id
JOIN road AS r ON r.road_id = rs.road_id
JOIN area AS a ON a.area_id = r.area_id
JOIN app_state AS active ON active.active_import_id = o.import_id
GROUP BY a.area_name, r.road_id, r.road_name
ORDER BY recorded_volume DESC
LIMIT 20;
```

The joins follow the normalized path from observation to its logical source location, road, and area. `SUM(vehicle_count)` adds the dataset's recorded volume field; it does not count distinct vehicles. `AVG(average_speed)` is an arithmetic mean of readings and its unit is undocumented.

## Compare each road with the mean road total

```sql
WITH road_totals AS (
  SELECT r.road_id, r.road_name, SUM(o.vehicle_count) AS volume
  FROM traffic_observation AS o
  JOIN sensor AS s ON s.sensor_id = o.sensor_id
  JOIN road_segment AS rs ON rs.segment_id = s.segment_id
  JOIN road AS r ON r.road_id = rs.road_id
  JOIN app_state AS active ON active.active_import_id = o.import_id
  GROUP BY r.road_id, r.road_name
)
SELECT road_name, volume
FROM road_totals
WHERE volume > (SELECT AVG(volume) FROM road_totals)
ORDER BY volume DESC;
```

The comparison uses the average of per-road totals, rather than the average individual observation. The app's “above average” saved exercise uses a subquery over the same filtered rows.

## Use a CTE to make a congestion comparison readable

```sql
WITH selected_readings AS (
  SELECT road_name, time_block, congestion_level, average_speed
  FROM v_traffic_observation
  WHERE import_id = (
    SELECT active_import_id FROM app_state WHERE singleton_id = 1
  )
)
SELECT road_name, time_block,
       COUNT(*) AS readings,
       ROUND(100 * AVG(congestion_level = 'High'), 2) AS high_reading_percent,
       ROUND(AVG(average_speed), 2) AS mean_source_speed
FROM selected_readings
GROUP BY road_name, time_block
ORDER BY high_reading_percent DESC, road_name, time_block;
```

`congestion_level = 'High'` evaluates as a Boolean in MySQL; its average is the fraction of high readings. The result describes this sample; it is not a calibrated traffic threshold.

## Rank locations by date and compare adjacent observed dates

```sql
WITH daily AS (
  SELECT road_id, road_name, observation_date,
         SUM(vehicle_count) AS recorded_volume
  FROM v_traffic_observation
  WHERE import_id = (
    SELECT active_import_id FROM app_state WHERE singleton_id = 1
  )
  GROUP BY road_id, road_name, observation_date
)
SELECT observation_date, road_name, recorded_volume,
       DENSE_RANK() OVER (
         PARTITION BY observation_date ORDER BY recorded_volume DESC
       ) AS daily_rank,
       LAG(observation_date) OVER (
         PARTITION BY road_id ORDER BY observation_date
       ) AS previous_observed_date,
       DATEDIFF(observation_date, LAG(observation_date) OVER (
         PARTITION BY road_id ORDER BY observation_date
       )) AS day_gap
FROM daily
ORDER BY observation_date DESC, daily_rank, road_name
LIMIT 200;
```

The `PARTITION BY` clauses restart ranking each date and comparisons for each road. `LAG` points to the previous available date for that road, which might be more than one calendar day earlier; `day_gap` makes that visible.

## Trace a normalized observation to its original CSV values

```sql
SELECT source_row, road_name, observation_date, time_block,
       JSON_UNQUOTE(JSON_EXTRACT(source_data, '$."TrafficSituation"'))
         AS original_situation,
       JSON_UNQUOTE(JSON_EXTRACT(source_data,
         '$."Roadwork and Construction Activity"')) AS original_roadwork
FROM v_traffic_observation
WHERE import_id = (
  SELECT active_import_id FROM app_state WHERE singleton_id = 1
)
ORDER BY source_row
LIMIT 20;
```

Typed relational columns support analysis while `source_data` preserves the original source fields for auditing. The importer retains the original CSV row number and file checksum at the import level.

## Inspect views and refreshed summary data

```sql
SHOW CREATE VIEW v_traffic_observation;
SHOW CREATE VIEW v_daily_road_summary;
SHOW CREATE VIEW v_congestion_report;

SELECT COUNT(*) AS stored_daily_summary_rows,
       SUM(total_volume) AS recorded_volume
FROM road_daily_summary
WHERE import_id = (
  SELECT active_import_id FROM app_state WHERE singleton_id = 1
);
```

These are ordinary views plus a physical summary table maintained by `CALL refresh_traffic_summary()`. MySQL does not call this a native materialized view. The website's Views screen compares the ordinary view and stored table using row-count-weighted average speed.

## Query plan comparison

The website's Index Benchmark runs the same filtered observation query with `IGNORE INDEX` and `FORCE INDEX (idx_obs_sensor_date)`, checks result checksums, and shows `EXPLAIN FORMAT=JSON` and `EXPLAIN ANALYZE`. Report the values observed on the presentation machine. Timings include database-driver round trips and are sensitive to caches and machine load; an index can be slower for some scopes.

## MySQL and course dialect note

The source project handout includes Oracle-oriented topics. This implementation targets the user's installed MySQL 8 workflow. SQL syntax and features differ across DBMS products. The project demonstrates MySQL-compatible relational design, checks, views, stored procedure, JSON, CTEs, window functions, and index plans; it does not claim Oracle compatibility or a native MySQL materialized view.
