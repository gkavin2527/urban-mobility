export const TIME_BLOCKS = ['Midnight', 'Morning', 'Daytime', 'Noon', 'Evening', 'Night'];
export const SOURCE_URL = 'https://www.kaggle.com/datasets/sandheepkochi/bangalore-traffic-2023-2024';
export const REQUIRED_COLUMNS = ['Date','Area Name','Road/Intersection Name','Traffic Volume','Average Speed','Congestion Level','TimeBlock'];

export function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, '');
  const matrix = []; let row = [], field = '', quoted = false, closed = false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (quoted) {
      if (ch==='"' && text[i+1]==='"') { field+='"'; i++; }
      else if (ch==='"') { quoted=false; closed=true; }
      else field+=ch;
    } else if (ch==='"') {
      if (field || closed) throw new Error('Unexpected quote in CSV');
      quoted=true;
    } else if (ch===',' || ch==='\n' || ch==='\r') {
      row.push(field); field=''; closed=false;
      if (ch!==',') { if(row.some(v=>v!=='')) matrix.push(row); row=[]; if(ch==='\r' && text[i+1]==='\n')i++; }
    } else { if(closed) throw new Error('Unexpected text after quoted CSV value'); field+=ch; }
  }
  if(quoted) throw new Error('Unterminated quoted CSV value');
  if(field || row.length || closed){ row.push(field); if(row.some(v=>v!==''))matrix.push(row); }
  if(!matrix.length)throw new Error('CSV is empty');
  const headers=matrix.shift().map(v=>v.trim());
  if(headers.some(v=>!v)||new Set(headers).size!==headers.length)throw new Error('CSV headers must be nonempty and unique');
  const rows=matrix.map((values,index)=>{
    if(values.length!==headers.length)throw new Error(`CSV record ${index+2} has ${values.length} fields; expected ${headers.length}`);
    return Object.fromEntries(headers.map((key,i)=>[key,values[i]]));
  });
  return {headers,rows};
}

export function validDate(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}
function requiredText(row,key,max=160){ const value=String(row[key]??'').trim(); if(!value||value.length>max)throw new Error(`${key}: missing or too long`); return value; }
function number(row,key,{integer=false,max=1e12,optional=false}={}) {
  const raw=String(row[key]??'').trim();
  if(optional&&!raw)return null;
  const value=Number(raw);
  if(!raw||!Number.isFinite(value)||value<0||value>max||(integer&&!Number.isInteger(value)))throw new Error(`${key}: invalid nonnegative ${integer?'integer':'number'}`);
  return value;
}
export function normalizeRow(source,sourceRow) {
  const date=requiredText(source,'Date',10); if(!validDate(date))throw new Error('Date: invalid calendar date');
  const congestion=requiredText(source,'Congestion Level',10); if(!['Low','Medium','High'].includes(congestion))throw new Error('Congestion Level: invalid category');
  const time=requiredText(source,'TimeBlock',20); if(!TIME_BLOCKS.includes(time))throw new Error('TimeBlock: unknown source category');
  const roadwork=String(source['Roadwork and Construction Activity']??'').trim();
  if(roadwork&&!['Yes','No'].includes(roadwork))throw new Error('Roadwork: invalid category');
  return {
    source_row:sourceRow, observation_date:date, area:requiredText(source,'Area Name'), road_name:requiredText(source,'Road/Intersection Name'), time_block:time,
    vehicle_count:number(source,'Traffic Volume',{integer:true,max:2147483647}), average_speed:number(source,'Average Speed'), congestion_level:congestion,
    travel_time_index:number(source,'Travel Time Index',{optional:true}), capacity_utilization:number(source,'Road Capacity Utilization',{max:100,optional:true}),
    incident_reports:number(source,'Incident Reports',{integer:true,max:2147483647,optional:true}), environmental_impact:number(source,'Environmental Impact',{optional:true}),
    public_transport_usage:number(source,'Public Transport Usage',{max:100,optional:true}), signal_compliance:number(source,'Traffic Signal Compliance',{max:100,optional:true}),
    parking_usage:number(source,'Parking Usage',{max:100,optional:true}), pedestrian_count:number(source,'Pedestrian and Cyclist Count',{integer:true,max:2147483647,optional:true}),
    weather:String(source['Weather Conditions']??'').trim()||null, roadwork:roadwork?roadwork==='Yes':null,
    traffic_situation:String(source.TrafficSituation??'').trim()||null, source_data:{...source},
  };
}
export function prepareDataset(records) {
  const rows=[],rejections=[],seen=new Set();let duplicates=0;
  for(const [index,record] of records.entries()){
    try {const row=normalizeRow(record,index+2);const fingerprint=JSON.stringify(record);if(seen.has(fingerprint))duplicates++;seen.add(fingerprint);rows.push(row);}
    catch(error){rejections.push({source_row:index+2,reason:error.message});}
  }
  const dates=rows.map(r=>r.observation_date).sort();
  return {rows,report:{input_rows:records.length,accepted_rows:rows.length,rejected_rows:rejections.length,duplicate_rows:duplicates,duplicate_policy:'Retain source rows; repeated file imports are idempotent by SHA-256.',min_date:dates[0]??null,max_date:dates.at(-1)??null,areas:new Set(rows.map(r=>r.area)).size,roads:new Set(rows.map(r=>`${r.area}\0${r.road_name}`)).size,time_blocks:TIME_BLOCKS.filter(t=>rows.some(r=>r.time_block===t)),rejections}};
}

export function parseFilters(input) {
  const raw=input instanceof URLSearchParams?Object.fromEntries(input):input;const result={};
  const allowed=new Set(['road','area','start','end','timeBlock','congestion','weather','roadwork','limit']);
  for(const [key,value] of Object.entries(raw)){
    if(!allowed.has(key))throw new Error(`Unsupported filter: ${key}`);
    if(value===''||value==null)continue;
    const text=String(value);
    if(text.length>160)throw new Error(`Filter ${key} is too long`);
    if(key==='road'||key==='limit'){
      if(!/^[1-9]\d*$/.test(text)||Number(text)>(key==='limit'?1000:2147483647))throw new Error(`Invalid ${key}`);
      result[key]=Number(text);
    }else if(key==='start'||key==='end'){if(!validDate(text))throw new Error(`Invalid ${key} date`);result[key]=text;}
    else if(key==='timeBlock'){if(!TIME_BLOCKS.includes(text))throw new Error('Invalid time block');result[key]=text;}
    else if(key==='congestion'){if(!['Low','Medium','High'].includes(text))throw new Error('Invalid congestion');result[key]=text;}
    else if(key==='roadwork'){if(!['Yes','No'].includes(text))throw new Error('Invalid roadwork');result[key]=text;}
    else result[key]=text;
  }
  if(result.start&&result.end&&result.start>result.end)throw new Error('Start date must not follow end date');
  return result;
}
export function buildWhere(importId,filters={},alias='o') {
  if(!['o','v'].includes(alias))throw new Error('Invalid query alias');
  const clauses=[`${alias}.import_id = ?`],params=[importId];
  const add=(sql,value)=>{if(value!==undefined){clauses.push(sql);params.push(value);}};
  add(`${alias}.road_id = ?`,filters.road);add(`${alias}.area = ?`,filters.area);add(`${alias}.observation_date >= ?`,filters.start);add(`${alias}.observation_date <= ?`,filters.end);
  add(`${alias}.time_block = ?`,filters.timeBlock);add(`${alias}.congestion_level = ?`,filters.congestion);add(`${alias}.weather = ?`,filters.weather);
  if(filters.roadwork)add(`${alias}.roadwork = ?`,filters.roadwork==='Yes'?1:0);
  return {sql:`WHERE ${clauses.join(' AND ')}`,params};
}
export function toCsv(rows,columns=Object.keys(rows[0]??{})) {
  const escape=value=>{
    if(typeof value==='number'&&Number.isFinite(value))return String(value);
    let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
    if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r]/.test(text))text=`'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  };
  return [columns.map(escape).join(','),...rows.map(row=>columns.map(key=>escape(row[key])).join(','))].join('\r\n');
}
