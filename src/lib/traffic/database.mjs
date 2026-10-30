import mysql from 'mysql2/promise';

export function connectionOptions(database=true) {
  const name=process.env.MYSQL_DATABASE||'urban_mobility';
  if(!/^urban_mobility(?:_test[a-z0-9_]*)?$/.test(name))throw new Error('MYSQL_DATABASE must be urban_mobility or a dedicated urban_mobility_test schema');
  if(!process.env.MYSQL_USER)throw new Error('Configure MySQL locally: run scripts/configure-local.ps1');
  const port=Number(process.env.MYSQL_PORT||3306);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid MYSQL_PORT');
  return {host:process.env.MYSQL_HOST||'127.0.0.1',port,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD||'',...(database?{database:name}:{}),connectTimeout:5000,dateStrings:true,decimalNumbers:true,supportBigNumbers:true,bigNumberStrings:true,charset:'utf8mb4',timezone:'Z',multipleStatements:false};
}
export function getPool(){
  if(!globalThis.__urbanMobilityPool)globalThis.__urbanMobilityPool=mysql.createPool({...connectionOptions(),connectionLimit:5,waitForConnections:true,queueLimit:30});
  return globalThis.__urbanMobilityPool;
}
export async function query(sql,params=[],executor=getPool()) {
  const started=performance.now();
  try {
    const [rows]=await executor.execute(sql,params);
    if(process.env.LOG_LEVEL==='debug')console.info('[mysql]',{operation:sql.trim().split(/\s/)[0],elapsed_ms:Math.round(performance.now()-started),rows:Array.isArray(rows)?rows.length:undefined});
    return rows;
  }catch(error){console.error('[mysql]',{code:error.code||'QUERY_ERROR',operation:sql.trim().split(/\s/)[0]});throw error;}
}
export async function activeImport(executor=getPool()) {
  const rows=await query('SELECT d.*, s.summary_refreshed_at FROM app_state s JOIN dataset_import d ON d.import_id=s.active_import_id WHERE s.singleton_id=1',[],executor);
  if(!rows.length){const e=new Error('No active dataset. Run npm run data:import after database setup.');e.code='NO_DATASET';throw e;}
  return rows[0];
}
export function publicError(error) {
  const messages={ECONNREFUSED:'MySQL is unavailable. Start MySQL80 and check the local connection.',ER_ACCESS_DENIED_ERROR:'MySQL rejected the local credentials. Run scripts/configure-local.ps1.',ER_BAD_DB_ERROR:'The database is not set up. Run npm run db:setup.',ER_NO_SUCH_TABLE:'Database tables are missing. Run npm run db:setup.',NO_DATASET:'No active dataset. Run npm run data:import.'};
  return messages[error.code]||(/Configure MySQL|MYSQL_DATABASE|MYSQL_PORT/.test(error.message)?error.message:'The database request failed. Check the server log and local setup.');
}
export function splitSqlScript(text){
  let delimiter=';',buffer='';const statements=[];
  for(const line of text.replaceAll('\r','').split('\n')){
    if(/^DELIMITER /i.test(line)){delimiter=line.slice(10).trim();continue;}
    buffer+=line+'\n';
    if(buffer.trimEnd().endsWith(delimiter)){const sql=buffer.trimEnd().slice(0,-delimiter.length).trim();if(sql)statements.push(sql);buffer='';}
  }
  if(buffer.replace(/--[^\n]*/g,'').trim())throw new Error('Unterminated SQL setup statement');
  return statements;
}
export async function closePool(){if(globalThis.__urbanMobilityPool){await globalThis.__urbanMobilityPool.end();globalThis.__urbanMobilityPool=undefined;}}
