import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns, runMetrics } from '../src/lib/simulation/metrics.mjs';

const base = {
  scenario: 'east_west_surge', demand_seed: 42, duration_seconds: 180,
  demand_fingerprint: 'same-seeded-arrivals', status: 'completed',
};

test('completed runs are compared using equal demand and stored totals', () => {
  const result = compareRuns(
    { ...base, total_arrived: '201', total_served: '97', total_wait_seconds: '9849', max_queue: '105' },
    { ...base, total_arrived: '201', total_served: '140', total_wait_seconds: '6303', max_queue: '62' },
  );
  assert.equal(result.demand_equal, true);
  assert.equal(result.fixed.average_wait_seconds, 49);
  assert.equal(result.adaptive.average_wait_seconds, 31.36);
  assert.equal(result.wait_change_percent, -36);
});

test('mismatched or unfinished demand cannot produce a performance percentage', () => {
  const fixed = { ...base, total_arrived: 100, total_wait_seconds: 1000 };
  const mismatch = compareRuns(fixed, { ...fixed, demand_fingerprint: 'different' });
  assert.equal(mismatch.demand_equal, false);
  assert.equal(mismatch.wait_change_percent, null);
  assert.equal(compareRuns(fixed, { ...fixed, duration_seconds: 300 }).demand_equal, false);
  assert.equal(compareRuns(fixed, { ...fixed, status: 'running' }), null);
  assert.equal(runMetrics({ total_arrived: 0, total_wait_seconds: 0 }).average_wait_seconds, 0);
});
