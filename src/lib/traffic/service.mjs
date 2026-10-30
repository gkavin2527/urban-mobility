import {createHash} from 'node:crypto';
import {activeImport,getPool,query} from './database.mjs';
import {buildWhere,TIME_BLOCKS,SOURCE_URL} from './core.mjs';
import {QUERY_LIBRARY,savedQuery} from './queries.mjs';

const sourceNote='Historical Kaggle dataset; publisher provenance and measurement units are not documented. Time blocks are categories, and location IDs are derived. No physical sensor, vehicle or trip identities are supplied.';
export async function bootstrap(){
  const source=await activeImport();
  const [roads,weather,counts,version]=await Promise.all([
    query('SELECT DISTINCT road_id,road_name,area,sensor_id,sensor_code FROM v_traffic_observation WHERE import_id=? ORDER BY area,road_name',[source.import_id]),
    query('SELECT DISTINCT weather FROM traffic_observation WHERE import_id=? ORDER BY weather',[source.import_id]),
    query('SELECT COUNT(*) AS observations,COUNT(DISTINCT sensor_id) AS locations,COUNT(DISTINCT observation_date) AS days FROM traffic_observation WHERE import_id=?',[source.import_id]),
    query('SELECT VERSION() AS version,DATABASE() AS database_name'),
  ]);
  return {source:{...source,quality_report:typeof source.quality_report==='string'?JSON.parse(source.quality_report):source.quality_report,note:sourceNote,url:SOURCE_URL},roads,areas:[...new Set(roads.map(r=>r.area))],weather:weather.map(r=>r.weather).filter(Boolean),timeBlocks:TIME_BLOCKS,counts:counts[0],database:version[0],queries:QUERY_LIBRARY.map(({body,...q})=>q)};
}
export async function analytics(filters={}){
  const source=await activeImport();const where=buildWhere(source.import_id,filters);const from=`FROM v_traffic_observation o ${where.sql}`;
  const [kpis,roads,daily,timeBlocks,congestion,weather,observations]=await Promise.all([
    query(`SELECT COUNT(*) AS readings,COUNT(DISTINCT road_id) AS roads,COUNT(DISTINCT area) AS areas,COALESCE(SUM(vehicle_count),0) AS recorded_volume,ROUND(AVG(average_speed),2) AS average_speed,ROUND(100.0*SUM(congestion_level='High')/NULLIF(COUNT(*),0),2) AS high_percent ${from}`,where.params),
    query(`SELECT road_id,road_name,area,sensor_code,COUNT(*) AS readings,SUM(vehicle_count) AS recorded_volume,ROUND(AVG(average_speed),2) AS average_speed,ROUND(100.0*SUM(congestion_level='High')/COUNT(*),2) AS high_percent,ROUND(AVG(capacity_utilization),2) AS capacity_utilization ${from} GROUP BY road_id,road_name,area,sensor_code ORDER BY recorded_volume DESC,road_name LIMIT 100`,where.params),
    query(`SELECT observation_date AS date,SUM(vehicle_count) AS recorded_volume,ROUND(AVG(average_speed),2) AS average_speed,COUNT(*) AS readings ${from} GROUP BY observation_date ORDER BY observation_date LIMIT 1000`,where.params),
    query(`SELECT time_block,COUNT(*) AS readings,SUM(vehicle_count) AS recorded_volume,ROUND(AVG(average_speed),2) AS average_speed ${from} GROUP BY time_block ORDER BY FIELD(time_block,'Midnight','Morning','Daytime','Noon','Evening','Night')`,where.params),
    query(`SELECT congestion_level,COUNT(*) AS readings ${from} GROUP BY congestion_level ORDER BY FIELD(congestion_level,'Low','Medium','High')`,where.params),
    query(`SELECT weather,COUNT(*) AS readings,ROUND(AVG(average_speed),2) AS average_speed,ROUND(AVG(travel_time_index),3) AS travel_time_index ${from} GROUP BY weather ORDER BY readings DESC`,where.params),
    query(`SELECT source_row,road_name,area,observation_date,time_block,vehicle_count,average_speed,congestion_level,weather,roadwork ${from} ORDER BY observation_date DESC,road_name,source_row LIMIT 50`,where.params),
  ]);
  return {import_id:source.import_id,kpis:kpis[0],roads,daily,timeBlocks,congestion,weather,observations,filters,scope:'All results use the same source import and filters. Speed is an arithmetic mean of source readings; volume is not unique vehicles.'};
}
export async function runSavedQuery(id,filters={}){
  const source=await activeImport(),definition=savedQuery(id,source.import_id,filters),started=performance.now();
  const rows=await query(definition.sql,definition.params);const elapsed=performance.now()-started;
  return {id,title:definition.title,sql:definition.sql,parameters:definition.params,why:definition.why,features:definition.features,columns:Object.keys(rows[0]||{}),rows,row_count:rows.length,round_trip_ms:Number(elapsed.toFixed(3)),measurement:'Database driver round-trip including row retrieval; not server CPU time.',import_id:source.import_id};
}
const TABLES=['dataset_import','area','road','road_segment','sensor','traffic_observation','vehicle','trip','app_state','road_daily_summary','simulation_run','simulation_step','simulation_lane_sample','simulation_action'];
export async function schema(){
  const tables=await query(`SELECT TABLE_NAME AS table_name,TABLE_TYPE AS table_type FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME`);
  const columns=await query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,COLUMN_TYPE AS column_type,IS_NULLABLE AS nullable,COLUMN_KEY AS column_key FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
  const relations=await query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,REFERENCED_TABLE_NAME AS referenced_table,REFERENCED_COLUMN_NAME AS referenced_column FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
  const indexes=await query('SELECT TABLE_NAME AS table_name,INDEX_NAME AS index_name,SEQ_IN_INDEX AS position,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
  const counts=await Promise.all(TABLES.map(async name=>({name,count:(await query(`SELECT COUNT(*) AS count FROM \`${name}\``))[0].count})));
  return {tables:tables.map(t=>({...t,row_count:counts.find(c=>c.name===t.table_name)?.count??null,columns:columns.filter(c=>c.table_name===t.table_name)})),relations,indexes,coverage:{vehicle:'Not supplied by this dataset; no records fabricated.',trip:'Not supplied by this dataset; no records fabricated.',sensor:'Logical source locations, not verified physical devices.'}};
}
export async function summaries(){
  const source=await activeImport();const [ordinary,cached,definitions]=await Promise.all([
    query('SELECT road_name,COUNT(*) AS dates,SUM(total_volume) AS recorded_volume,ROUND(SUM(average_speed*reading_count)/SUM(reading_count),2) AS average_speed FROM v_daily_road_summary WHERE import_id=? GROUP BY road_id,road_name ORDER BY road_name',[source.import_id]),
    query('SELECT r.road_name,COUNT(*) AS dates,SUM(c.total_volume) AS recorded_volume,ROUND(SUM(c.average_speed*c.reading_count)/SUM(c.reading_count),2) AS average_speed FROM road_daily_summary c JOIN road r ON r.road_id=c.road_id WHERE c.import_id=? GROUP BY r.road_id,r.road_name ORDER BY r.road_name',[source.import_id]),
    query('SELECT TABLE_NAME AS name,VIEW_DEFINITION AS definition FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME'),
  ]);
  return {ordinary,cached,definitions,refreshed_at:source.summary_refreshed_at,matches:source.summary_refreshed_at!==null&&JSON.stringify(ordinary)===JSON.stringify(cached),import_id:source.import_id,scope:'Full active import across all time blocks. Global analysis filters do not apply to these dataset-wide summaries.',implementation:'MySQL refreshable summary table; MySQL has no native materialized views.'};
}
export async function refreshSummary(){await query('CALL refresh_traffic_summary()');return summaries();}
export async function benchmark(filters={}){
  const source=await activeImport();
  const candidates=await query('SELECT DISTINCT sensor_id,road_id,road_name,area FROM v_traffic_observation WHERE import_id=? ORDER BY road_id',[source.import_id]);
  const target=candidates.find(r=>(!filters.area||r.area===filters.area)&&(!filters.road||Number(r.road_id)===filters.road))||(!filters.area&&!filters.road?candidates[0]:null);if(!target)throw new Error('No benchmark target matches the selected area and road');
  const params=[source.import_id,target.sensor_id,filters.start||source.min_date,filters.end||source.max_date];
  let extra='';for(const [key,column] of [['timeBlock','time_block'],['congestion','congestion_level'],['weather','weather']]){if(filters[key]){extra+=` AND ${column}=?`;params.push(filters[key]);}}
  if(filters.roadwork){extra+=' AND roadwork=?';params.push(filters.roadwork==='Yes'?1:0);}
  const columns='observation_id,observation_date,time_block,vehicle_count,average_speed,congestion_level';
  const tail=`WHERE import_id=? AND sensor_id=? AND observation_date BETWEEN ? AND ?${extra} ORDER BY observation_date,source_row`;
  const indexRows=await query("SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='traffic_observation'");
  const names=indexRows.map(r=>r.name).filter(name=>/^[A-Za-z0-9_]+$/.test(name));
  const statements={without:`SELECT ${columns} FROM traffic_observation IGNORE INDEX (${names.map(n=>'`'+n+'`').join(',')}) ${tail}`,withIndex:`SELECT ${columns} FROM traffic_observation FORCE INDEX (idx_obs_sensor_date) ${tail}`};
  const db=await getPool().getConnection();
  try{
    const results={};
    for(const [mode,sql] of Object.entries(statements)){
      const rows=await query(sql,params,db);const samples=[];
      for(let i=0;i<3;i++){const start=performance.now();await query(sql,params,db);samples.push(Number((performance.now()-start).toFixed(3)));}
      const explanation=await query('EXPLAIN FORMAT=JSON '+sql,params,db);
      const actual=await query('EXPLAIN ANALYZE '+sql,params,db);
      results[mode]={samples_ms:samples,median_ms:[...samples].sort((a,b)=>a-b)[1],row_count:rows.length,checksum:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),plan:JSON.parse(Object.values(explanation[0])[0]),actual_plan:Object.values(actual[0])[0],sql};
    }
    return {...results,equivalent:results.without.checksum===results.withIndex.checksum,target,parameters:params,measurement:'Three warmed database-driver round trips per variant on one connection. Plans include server execution measurements. Index hints are non-destructive; an index is not guaranteed to be faster. The target is one source location, using selected dates and categorical conditions.'};
  }finally{db.release();}
}
export async function report(type,filters={}){
  const id={roads:'busiest-roads',periods:'time-blocks',congestion:'congestion',daily:'daily-ranking',weather:'weather','source-json':'source-json'}[type];
  if(!id)throw new Error('Unknown report type');
  return {...await runSavedQuery(id,filters),report_type:type};
}
