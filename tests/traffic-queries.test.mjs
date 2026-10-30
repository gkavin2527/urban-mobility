import test from 'node:test';
import assert from 'node:assert/strict';
import {QUERY_LIBRARY,savedQuery} from '../src/lib/traffic/queries.mjs';
test('every saved query binds the same import and source filters',()=>{
  assert.ok(QUERY_LIBRARY.length>=8);
  for(const entry of QUERY_LIBRARY){
    const result=savedQuery(entry.id,9,{road:2,area:'Indiranagar',start:'2024-01-01',timeBlock:'Morning'});
    assert.deepEqual(result.params,[9,2,'Indiranagar','2024-01-01','Morning']);
    assert.equal((result.sql.match(/\?/g)||[]).length,5);
    assert.match(result.sql,/WITH filtered AS/);
    assert.equal(result.sql.includes('2024-01-01'),false);
  }
});
test('unknown SQL identifiers cannot execute arbitrary statements',()=>{
  assert.throws(()=>savedQuery('SELECT * FROM mysql.user',1),/Unknown saved query/);
  assert.equal(new Set(QUERY_LIBRARY.map(q=>q.id)).size,QUERY_LIBRARY.length);
});
