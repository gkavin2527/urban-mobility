import { activeImport, closePool, query } from '../src/lib/traffic/database.mjs';
import { QUERY_LIBRARY, savedQuery } from '../src/lib/traffic/queries.mjs';

try {
  const source = await activeImport();
  const [counts] = await query('SELECT COUNT(*) AS observations, COUNT(DISTINCT sensor_id) AS locations, COUNT(DISTINCT observation_date) AS days FROM traffic_observation WHERE import_id=?', [source.import_id]);
  const [orphans] = await query(`SELECT COUNT(*) AS orphaned FROM traffic_observation o
    LEFT JOIN sensor s ON s.sensor_id=o.sensor_id LEFT JOIN road_segment rs ON rs.segment_id=s.segment_id
    LEFT JOIN road r ON r.road_id=rs.road_id LEFT JOIN area a ON a.area_id=r.area_id
    WHERE o.import_id=? AND (s.sensor_id IS NULL OR rs.segment_id IS NULL OR r.road_id IS NULL OR a.area_id IS NULL)`, [source.import_id]);
  const [summary] = await query('SELECT COUNT(*) AS rows_count FROM road_daily_summary WHERE import_id=?', [source.import_id]);
  const [views] = await query('SELECT COUNT(*) AS views_count FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?)', ['v_traffic_observation','v_daily_road_summary','v_congestion_report']);
  const [simulation] = await query('SELECT COUNT(*) AS tables_count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)', ['simulation_run','simulation_step','simulation_lane_sample','simulation_action']);
  const probes=[];
  for (const definition of QUERY_LIBRARY) {
    const compiled=savedQuery(definition.id,source.import_id,{});
    const rows=await query(compiled.sql,compiled.params);
    probes.push({id:definition.id,compiled:true,executed:true,returned_sample:rows.length>0});
  }
  const report={status:Number(counts.observations)===Number(source.accepted_rows)&&Number(orphans.orphaned)===0&&Number(views.views_count)===3&&Number(simulation.tables_count)===4&&Number(summary.rows_count)>0&&Boolean(source.summary_refreshed_at)&&probes.length===QUERY_LIBRARY.length?'verified':'review required',database:process.env.MYSQL_DATABASE||'urban_mobility',mysql_version:(await query('SELECT VERSION() AS version'))[0].version,import_id:source.import_id,sha256:source.source_sha256,expected_rows:source.accepted_rows,observations:counts.observations,locations:counts.locations,days:counts.days,orphaned_observations:orphans.orphaned,daily_summary_rows:summary.rows_count,project_views:views.views_count,simulation_tables:simulation.tables_count,saved_queries:probes,summary_refreshed_at:source.summary_refreshed_at};
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='verified')process.exitCode=1;
} finally { await closePool(); }
