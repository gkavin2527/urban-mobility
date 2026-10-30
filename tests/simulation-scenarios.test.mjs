import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemandPlan, demandFingerprint, validateSettings } from '../src/lib/simulation/engine.mjs';
import { derivedScenarios, scenarioLabel } from '../src/lib/simulation/scenarios.mjs';

// Per-time-block average reported volume, as the importer stores it.
const BLOCKS = [
  { time_block: 'Evening', avg_volume: 8148 }, { time_block: 'Daytime', avg_volume: 7566 },
  { time_block: 'Noon', avg_volume: 5529 }, { time_block: 'Night', avg_volume: 4365 },
  { time_block: 'Morning', avg_volume: 2328 }, { time_block: 'Midnight', avg_volume: 1164 },
];
const arrivals = plan => plan.reduce((sum, second) => sum + Object.values(second).reduce((a, b) => a + b, 0), 0);

test('peak and off-peak scenarios are scaled from the busiest and quietest time blocks', () => {
  const [peak, offpeak] = derivedScenarios(BLOCKS);
  assert.equal(peak.id, 'peak_x168');       // Evening is 1.68x the all-block mean
  assert.equal(offpeak.id, 'offpeak_x24');  // Midnight is 0.24x
  assert.match(peak.description, /Evening/);
  assert.match(offpeak.description, /Midnight/);
});

test('a derived scenario is replayable and drives demand up at peak, down off-peak', () => {
  const [peak, offpeak] = derivedScenarios(BLOCKS);
  const plan = id => createDemandPlan(id, 42);
  assert.equal(demandFingerprint(plan(peak.id)), demandFingerprint(plan(peak.id)));
  assert.ok(arrivals(plan(peak.id)) > arrivals(plan('balanced')));
  assert.ok(arrivals(plan('balanced')) > arrivals(plan(offpeak.id)));
});

test('derived ids outside the allowed scale, or malformed, are rejected', () => {
  for (const scenario of ['peak_x19', 'peak_x201', 'peak_x9', 'offpeak_x1', 'peak_168', 'peak_x1.5', 'bogus']) {
    assert.throws(() => validateSettings({ scenario }), /Invalid simulation scenario/, scenario);
  }
  for (const scenario of ['peak_x20', 'peak_x200']) assert.doesNotThrow(() => validateSettings({ scenario }), scenario);
});

test('too little data yields no derived scenarios', () => {
  assert.deepEqual(derivedScenarios([]), []);
  assert.deepEqual(derivedScenarios([BLOCKS[0]]), []);
});

test('scenario labels are readable for stored ids', () => {
  assert.equal(scenarioLabel('peak_x168'), 'Dataset peak demand ×1.68');
  assert.equal(scenarioLabel('balanced'), 'Balanced approaches');
  assert.equal(scenarioLabel('old_unknown_id'), 'old unknown id');
});
