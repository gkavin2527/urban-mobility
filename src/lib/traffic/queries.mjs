import {buildWhere} from './core.mjs';
export const QUERY_LIBRARY = [
  {id:'busiest-roads',title:'Busiest roads',category:'JOIN',features:['JOIN','GROUP BY','SUM'],why:'Joins the filtered observations to roads and areas. Volume is the sum of the source Traffic Volume values, not a count of unique vehicles.',body:`SELECT r.road_id, r.road_name, a.area_name AS area,
  SUM(o.vehicle_count) AS recorded_volume, ROUND(AVG(o.average_speed),2) AS average_speed, COUNT(*) AS readings
FROM filtered o JOIN road r ON r.road_id=o.road_id
JOIN area a ON a.area_id=r.area_id
GROUP BY r.road_id,r.road_name,a.area_name ORDER BY recorded_volume DESC,r.road_id LIMIT 100`},
  {id:'time-blocks',title:'Traffic by source time block',category:'Aggregate',features:['GROUP BY','AVG','SUM'],why:'Uses the six categorical TimeBlock labels supplied by the CSV. The source does not define precise hourly boundaries.',body:`SELECT time_block, SUM(vehicle_count) AS recorded_volume,
  ROUND(AVG(average_speed),2) AS average_speed, COUNT(*) AS readings
FROM filtered GROUP BY time_block
ORDER BY FIELD(time_block,'Midnight','Morning','Daytime','Noon','Evening','Night')`},
  {id:'above-average',title:'Roads above average volume',category:'Subquery',features:['Subquery','HAVING','AVG'],why:'Compares each road total with the mean of road totals from exactly the same filtered observations.',body:`SELECT road_name, SUM(vehicle_count) AS recorded_volume
FROM filtered GROUP BY road_id,road_name
HAVING SUM(vehicle_count) > (SELECT AVG(total) FROM
  (SELECT SUM(vehicle_count) AS total FROM filtered GROUP BY road_id) road_totals)
ORDER BY recorded_volume DESC LIMIT 100`},
  {id:'congestion',title:'Congestion by road and period',category:'CTE',features:['CTE','CASE','GROUP BY'],why:'A named CTE isolates the selected location/date/period observations before calculating high-congestion reading percentages.',body:`SELECT road_name,time_block,COUNT(*) AS readings,
  ROUND(100.0*SUM(CASE WHEN congestion_level='High' THEN 1 ELSE 0 END)/COUNT(*),2) AS high_percent,
  ROUND(AVG(average_speed),2) AS average_speed
FROM filtered GROUP BY road_id,road_name,time_block ORDER BY high_percent DESC,road_name,time_block LIMIT 100`},
  {id:'daily-ranking',title:'Daily road ranking',category:'Window',features:['DENSE_RANK','PARTITION BY','CTE'],why:'First aggregates each road for each date, then ranks roads within that date. Equal volumes receive equal ranks.',body:`SELECT observation_date,road_name,total_volume,
  DENSE_RANK() OVER(PARTITION BY observation_date ORDER BY total_volume DESC) AS daily_rank
FROM (SELECT observation_date,road_id,road_name,SUM(vehicle_count) AS total_volume
  FROM filtered GROUP BY observation_date,road_id,road_name) daily
ORDER BY observation_date DESC,daily_rank,road_name LIMIT 200`},
  {id:'day-change',title:'Change since previous observed date',category:'Window',features:['LAG','CTE','Date arithmetic'],why:'LAG compares each road with its previous available observation date. The day gap is included so missing calendar days are not concealed.',body:`SELECT observation_date,road_name,total_volume,
  LAG(total_volume) OVER(PARTITION BY road_id ORDER BY observation_date) AS previous_volume,
  total_volume-LAG(total_volume) OVER(PARTITION BY road_id ORDER BY observation_date) AS volume_change,
  DATEDIFF(observation_date,LAG(observation_date) OVER(PARTITION BY road_id ORDER BY observation_date)) AS day_gap
FROM (SELECT observation_date,road_id,road_name,SUM(vehicle_count) AS total_volume
  FROM filtered GROUP BY observation_date,road_id,road_name) daily
ORDER BY observation_date DESC,road_name LIMIT 200`},
  {id:'slow-roads',title:'Slow roads with sufficient readings',category:'Aggregate',features:['HAVING','COUNT','AVG'],why:'Requires at least six readings and a mean speed below 35 in the source speed units. This is an illustrative analytical threshold, not a calibrated traffic standard.',body:`SELECT road_name,COUNT(*) AS readings,ROUND(AVG(average_speed),2) AS average_speed
FROM filtered GROUP BY road_id,road_name HAVING COUNT(*)>=6 AND AVG(average_speed)<35
ORDER BY average_speed,road_name LIMIT 100`},
  {id:'morning-evening',title:'Morning versus evening',category:'CTE',features:['CTE','Conditional aggregation'],why:'Compares named source periods without assigning invented clock hours. Other active filters remain in effect.',body:`SELECT road_name,
  SUM(CASE WHEN time_block='Morning' THEN vehicle_count ELSE 0 END) AS morning_volume,
  SUM(CASE WHEN time_block='Evening' THEN vehicle_count ELSE 0 END) AS evening_volume
FROM filtered GROUP BY road_id,road_name ORDER BY road_name LIMIT 100`},
  {id:'weather',title:'Weather and traffic conditions',category:'Aggregate',features:['GROUP BY','CASE','AVG'],why:'Summarizes association in the source records. These results do not establish that weather caused a change in traffic.',body:`SELECT weather,COUNT(*) AS readings,ROUND(AVG(average_speed),2) AS average_speed,
  ROUND(AVG(travel_time_index),3) AS travel_time_index,
  ROUND(100.0*SUM(congestion_level='High')/COUNT(*),2) AS high_percent
FROM filtered GROUP BY weather ORDER BY readings DESC`},
  {id:'source-json',title:'Trace records to source JSON',category:'JSON',features:['JSON_EXTRACT','JSON_UNQUOTE','Provenance'],why:'Every observation retains all 18 original source values, making normalization auditable.',body:`SELECT source_row,road_name,observation_date,time_block,
  JSON_UNQUOTE(JSON_EXTRACT(source_data,'$."TrafficSituation"')) AS original_situation,
  JSON_UNQUOTE(JSON_EXTRACT(source_data,'$."Roadwork and Construction Activity"')) AS original_roadwork
FROM filtered ORDER BY source_row LIMIT 50`},
  {id:'set-union',title:'Roads with high congestion or roadwork',category:'Set',features:['UNION','DISTINCT'],why:'UNION deduplicates roads found by either condition. Both branches use the same filtered source records.',body:`SELECT road_name FROM filtered WHERE congestion_level='High'
UNION SELECT road_name FROM filtered WHERE roadwork=1
ORDER BY road_name LIMIT 100`},
];
export function savedQuery(id,importId,filters={}){
  const entry=QUERY_LIBRARY.find(q=>q.id===id);if(!entry)throw new Error('Unknown saved query');
  const where=buildWhere(importId,filters);
  return {...entry,sql:`WITH filtered AS (\n  SELECT o.* FROM v_traffic_observation o\n  ${where.sql}\n)\n${entry.body}`,params:where.params};
}
