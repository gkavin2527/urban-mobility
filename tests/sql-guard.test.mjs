import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReadOnlySql } from '../src/lib/traffic/sql-guard.mjs';

test('plain SELECT and WITH queries pass, with one trailing semicolon tolerated', () => {
  assert.equal(checkReadOnlySql('  SELECT road_name FROM road;  '), 'SELECT road_name FROM road');
  assert.ok(checkReadOnlySql('with t as (select 1 as n) select n from t'));
  assert.ok(checkReadOnlySql('SELECT * FROM `road` WHERE road_name LIKE \'%into; -- #%\''), 'string contents are not code');
  assert.ok(checkReadOnlySql('SELECT REPLACE(road_name, \'a\', \'b\') FROM road'), 'REPLACE() is a function, not DML');
});

test('anything that is not a single read-only SELECT is refused', () => {
  const refused = [
    'DELETE FROM road',
    'UPDATE road SET road_name = \'x\'',
    'DROP TABLE road',
    'SELECT 1; DROP TABLE road',
    'SELECT * FROM road INTO OUTFILE \'/tmp/x\'',
    'SELECT 1 INTO @v',
    'SELECT * FROM road FOR UPDATE',
    'SELECT * FROM road LOCK IN SHARE MODE',
    'SELECT SLEEP(10)',
    'SELECT BENCHMARK(1000000, MD5(1))',
    'SELECT LOAD_FILE(\'/etc/passwd\')',
    'SELECT * FROM mysql.user',
    'SELECT * FROM `information_schema`.tables',
    'SELECT * FROM performance_schema . threads',
    'SELECT 1 -- hides the rest',
    'SELECT 1 /* x */',
    'SELECT 1 # x',
    '',
    '   ;  ',
    'EXPLAIN SELECT 1',
  ];
  for (const sql of refused) assert.throws(() => checkReadOnlySql(sql), /^Error: Invalid SQL/, sql);
  assert.throws(() => checkReadOnlySql(42), /Invalid SQL/);
  assert.throws(() => checkReadOnlySql('SELECT ' + '1,'.repeat(5000) + '1'), /under/);
});
