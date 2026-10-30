import test from 'node:test';
import assert from 'node:assert/strict';
import { simulationSteps } from '../src/lib/simulation/engine.mjs';
import { recordSample } from '../src/lib/simulation/persistence.mjs';

const state = [...simulationSteps({ scenario: 'balanced', seed: 2, duration: 60 })][4];

test('a sample commits its step, four lane readings, actions, and run totals together', async () => {
  const calls = [];
  const db = {
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => calls.push({ sql, params }),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };
  await recordSample(db, 7, state, [{
    sim_second: 5, from_phase: 'NS', to_phase: 'EW', reason: 'test', current_queue: 2, opposing_queue: 4,
  }]);
  assert.equal(calls[0], 'begin');
  assert.equal(calls.at(-1), 'commit');
  assert.equal(calls.includes('rollback'), false);
  assert.equal(calls.filter(call => typeof call === 'object' && call.sql.includes('simulation_lane_sample')).length, 4);
  assert.equal(calls.filter(call => typeof call === 'object' && call.sql.includes('simulation_action')).length, 1);
  const step = calls.find(call => typeof call === 'object' && call.sql.includes('simulation_step'));
  assert.equal(step.params[0], 7);
  assert.equal(step.params[1], 5);
  assert.equal(JSON.parse(step.params.at(-1)).lanes.N.queue, state.lanes.N.queue);
});

test('a failed write rolls back the whole sample and does not commit', async () => {
  const calls = [];
  const db = {
    beginTransaction: async () => calls.push('begin'),
    execute: async sql => {
      calls.push(sql);
      if (sql.includes('simulation_lane_sample')) throw new Error('write failed');
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
  };
  await assert.rejects(recordSample(db, 7, state, []), /write failed/);
  assert.equal(calls.at(-1), 'rollback');
  assert.equal(calls.includes('commit'), false);
});
