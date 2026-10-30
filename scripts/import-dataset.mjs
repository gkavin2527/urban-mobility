import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {connectionOptions} from '../src/lib/traffic/database.mjs';
import {parseCsv,prepareDataset,REQUIRED_COLUMNS,SOURCE_URL} from '../src/lib/traffic/core.mjs';
const file=process.argv[2]||process.env.DATASET_CSV||'data/raw/bangalore_traffic_timely_data.csv';
const bytes=await readFile(file),sha=createHash('sha256').update(bytes).digest('hex');
const csv=parseCsv(bytes.toString('utf8'));for(const column of REQUIRED_COLUMNS)if(!csv.headers.includes(column))throw new Error(`Missing source column: ${column}`);
const {rows,report}=prepareDataset(csv.rows);if(!rows.length)throw new Error('No valid rows; import was not activated');
const db=await mysql.createConnection(connectionOptions());
try{
  await db.beginTransaction();
  await db.query('SELECT singleton_id FROM app_state WHERE singleton_id=1 FOR UPDATE');
  const [existing]=await db.execute('SELECT import_id FROM dataset_import WHERE source_sha256=?',[sha]);
  let importId=existing[0]?.import_id;
  if(!importId){
    const [insert]=await db.execute('INSERT INTO dataset_import (source_sha256,source_file,source_url,input_rows,accepted_rows,rejected_rows,duplicate_rows,min_date,max_date,quality_report) VALUES (?,?,?,?,?,?,?,?,?,?)',[sha,basename(file),SOURCE_URL,report.input_rows,report.accepted_rows,report.rejected_rows,report.duplicate_rows,report.min_date,report.max_date,JSON.stringify({...report,columns:csv.headers,provenance:'Publisher provides no source description; observational origin and units are unverified.'})]);importId=insert.insertId;
    const sensorMap=new Map();
    for(const row of rows){
      const key=`${row.area}\0${row.road_name}`;if(sensorMap.has(key))continue;
      const [a]=await db.execute('INSERT INTO area (area_name) VALUES (?) ON DUPLICATE KEY UPDATE area_id=LAST_INSERT_ID(area_id)',[row.area]);
      const [r]=await db.execute('INSERT INTO road (area_id,road_name) VALUES (?,?) ON DUPLICATE KEY UPDATE road_id=LAST_INSERT_ID(road_id)',[a.insertId,row.road_name]);
      const [s]=await db.execute('INSERT INTO road_segment (road_id,segment_name) VALUES (?,?) ON DUPLICATE KEY UPDATE segment_id=LAST_INSERT_ID(segment_id)',[r.insertId,row.road_name]);
      const [sensor]=await db.execute('INSERT INTO sensor (segment_id,sensor_code) VALUES (?,?) ON DUPLICATE KEY UPDATE sensor_id=LAST_INSERT_ID(sensor_id)',[s.insertId,`BLR-LOC-${String(r.insertId).padStart(3,'0')}`]);sensorMap.set(key,sensor.insertId);
    }
    const columns=['import_id','sensor_id','source_row','observation_date','time_block','vehicle_count','average_speed','congestion_level','travel_time_index','capacity_utilization','incident_reports','environmental_impact','public_transport_usage','signal_compliance','parking_usage','pedestrian_count','weather','roadwork','traffic_situation','source_data'];
    for(let i=0;i<rows.length;i+=250){
      const batch=rows.slice(i,i+250).map(row=>columns.map(column=>column==='import_id'?importId:column==='sensor_id'?sensorMap.get(`${row.area}\0${row.road_name}`):column==='source_data'?JSON.stringify(row.source_data):row[column]));
      await db.query(`INSERT INTO traffic_observation (${columns.join(',')}) VALUES ?`,[batch]);
      if(i%5000===0)console.log('Imported',Math.min(i+250,rows.length),'/',rows.length);
    }
  }
  await db.execute('UPDATE app_state SET active_import_id=?, summary_refreshed_at=NULL WHERE singleton_id=1',[importId]);
  await db.commit();await db.query('CALL refresh_traffic_summary()');
  await mkdir('data/processed',{recursive:true});
  await writeFile('data/processed/import-report.json',JSON.stringify({...report,sha256:sha,import_id:importId,source_url:SOURCE_URL,columns:csv.headers},null,2));
  console.log(JSON.stringify({status:existing.length?'existing import reused':'import completed',import_id:importId,sha256:sha,...report,rejections:report.rejections.slice(0,10)},null,2));
}catch(error){await db.rollback();throw error;}finally{await db.end();}
