import test from 'node:test';
import assert from 'node:assert/strict';
const core = await import('../src/lib/traffic/core.mjs').catch(() => ({}));
const sample = { Date: '2024-02-29', 'Area Name': 'Indiranagar', 'Road/Intersection Name': '100 Feet Road', 'Traffic Volume': '120', 'Average Speed': '34.5', 'Travel Time Index': '1.2', 'Congestion Level': 'High', 'Road Capacity Utilization': '80', 'Incident Reports': '0', 'Environmental Impact': '120.5', 'Public Transport Usage': '50', 'Traffic Signal Compliance': '90', 'Parking Usage': '60', 'Pedestrian and Cyclist Count': '12', 'Weather Conditions': 'Clear', 'Roadwork and Construction Activity': 'No', TimeBlock: 'Morning', TrafficSituation: 'High' };
test('CSV handles BOM, quoted commas, escaped quotes and embedded newlines', () => {
  assert.equal(typeof core.parseCsv, 'function', 'CSV parser is not implemented');
  assert.deepEqual(core.parseCsv('\uFEFFa,b\r\n"x,y","say ""hi""\nnext"\r\n').rows, [{ a: 'x,y', b: 'say "hi"\nnext' }]);
});
test('CSV rejects mismatched widths, duplicate headers and unterminated strings', () => {
  assert.equal(typeof core.parseCsv, 'function');
  for (const csv of ['a,b\n1\n', 'a,a\n1,2', 'a\n"unclosed']) assert.throws(() => core.parseCsv(csv));
});
test('source dates and categorical time blocks remain distinct without fabricated timestamps', () => {
  assert.equal(typeof core.normalizeRow, 'function');
  const row = core.normalizeRow(sample, 2);
  assert.equal(row.observation_date, '2024-02-29');
  assert.equal(row.time_block, 'Morning');
  assert.equal(row.vehicle_count, 120);
  assert.equal(row.average_speed, 34.5);
  assert.equal(row.source_row, 2);
  assert.deepEqual(row.source_data, sample);
  assert.equal(row.timestamp, undefined);
});
test('invalid dates, missing metrics, negative counts and unknown time blocks are rejected', () => {
  assert.equal(typeof core.normalizeRow, 'function');
  for (const patch of [{ Date:'2023-02-29' }, {'Traffic Volume':'-1'}, {'Traffic Volume':'1.2'}, {'Average Speed':''}, {TimeBlock:'invented'}, {'Road Capacity Utilization':'101'}, {'Incident Reports':'NaN'}]) assert.throws(() => core.normalizeRow({...sample,...patch},2));
});
test('a quality profile retains distinct source rows and reports duplicates rather than inventing events', () => {
  assert.equal(typeof core.prepareDataset, 'function');
  const data=core.prepareDataset([sample,sample,{...sample,Date:'bad'}]);
  assert.equal(data.rows.length,2);
  assert.equal(data.report.duplicate_rows,1);
  assert.equal(data.report.rejected_rows,1);
  assert.equal(data.report.input_rows,3);
  assert.equal(data.report.min_date,'2024-02-29');
});
test('filters validate dates, row limits and unsupported dimensions', () => {
  assert.equal(typeof core.parseFilters, 'function');
  assert.deepEqual(core.parseFilters({road:'1',start:'2024-01-01',end:'2024-02-29',timeBlock:'Morning'}),{road:1,start:'2024-01-01',end:'2024-02-29',timeBlock:'Morning'});
  for(const f of [{road:'1 OR 1=1'},{start:'2024-02-30'},{start:'2024-02-01',end:'2024-01-01'},{vehicleType:'Car'},{hour:'8'},{limit:'100000'},{congestion:'critical'}]) assert.throws(()=>core.parseFilters(f));
});
test('filter values are SQL parameters and cannot alter the SQL structure', () => {
  assert.equal(typeof core.buildWhere, 'function');
  const filter=core.parseFilters({area:"x' OR 1=1 --",timeBlock:'Morning'});
  const result=core.buildWhere(4,filter,'o');
  assert.equal(result.sql.includes("x'"),false);
  assert.deepEqual(result.params,[4,"x' OR 1=1 --",'Morning']);
  assert.match(result.sql,/import_id = \?/);
});
test('CSV export preserves commas/quotes and neutralizes formula strings', () => {
  assert.equal(typeof core.toCsv, 'function');
  const csv=core.toCsv([{name:'=HYPERLINK("bad")',count:12},{name:'a,b',count:3}],['name','count']);
  assert.match(csv,/'=HYPERLINK/);
  assert.match(csv,/"a,b",3/);
  assert.equal(csv.split('\r\n').length,3);
});
