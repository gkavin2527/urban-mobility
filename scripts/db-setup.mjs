import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {connectionOptions,splitSqlScript} from '../src/lib/traffic/database.mjs';
const options=connectionOptions(false),name=process.env.MYSQL_DATABASE||'urban_mobility';
const db=await mysql.createConnection(options);
try {
  await db.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs`);
  await db.changeUser({database:name});
  for(const file of ['001_schema.sql','002_views.sql','003_refresh_summary.sql','004_simulation.sql']){
    const text=await readFile(new URL(`../sql/${file}`,import.meta.url),'utf8');
    for(const statement of splitSqlScript(text))await db.query(statement);
    console.log('Applied',file);
  }
  const [version]=await db.query('SELECT VERSION() AS version, DATABASE() AS database_name');console.log(version[0]);
}finally{await db.end();}
