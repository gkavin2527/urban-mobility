import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROACHES, createDemandPlan, demandFingerprint, finalSimulationState,
  simulationSteps, validateSettings,
} from '../src/lib/simulation/engine.mjs';

test('fixed and adaptive modes receive exactly the same seeded arrivals', () => {
  const fixed = [...simulationSteps({ scenario: 'east_west_surge', seed: 42, mode: 'fixed' })];
  const adaptive = [...simulationSteps({ scenario: 'east_west_surge', seed: 42, mode: 'adaptive' })];
  assert.equal(fixed.length, 180);
  assert.equal(fixed.at(-1).demand_fingerprint, adaptive.at(-1).demand_fingerprint);
  assert.deepEqual(fixed.map(step => step.total_arrived), adaptive.map(step => step.total_arrived));
  assert.notDeepEqual(fixed.map(step => step.phase), adaptive.map(step => step.phase));
});

test('every step conserves arrivals and never serves more than arrived', () => {
  for (const step of simulationSteps({ scenario: 'balanced', seed: 11, mode: 'adaptive' })) {
    const waiting = APPROACHES.reduce((sum, lane) => sum + step.lanes[lane].queue, 0);
    assert.equal(step.total_arrived, step.total_served + waiting);
    assert.equal(step.queue_total, waiting);
    assert.ok(step.max_queue >= waiting);
    assert.ok(['green', 'yellow', 'all_red'].includes(step.signal));
    assert.ok(['NS', 'EW'].includes(step.phase));
    for (const action of step.actions) assert.notEqual(action.from_phase, action.to_phase);
  }
});

test('surge scenarios can benefit while balanced demand can favor fixed timing', () => {
  const eastFixed = finalSimulationState({ scenario: 'east_west_surge', seed: 42, mode: 'fixed' });
  const eastAdaptive = finalSimulationState({ scenario: 'east_west_surge', seed: 42, mode: 'adaptive' });
  const balancedFixed = finalSimulationState({ scenario: 'balanced', seed: 42, mode: 'fixed' });
  const balancedAdaptive = finalSimulationState({ scenario: 'balanced', seed: 42, mode: 'adaptive' });
  assert.equal(eastFixed.total_arrived, eastAdaptive.total_arrived);
  assert.ok(eastAdaptive.average_wait_seconds < eastFixed.average_wait_seconds);
  assert.ok(eastAdaptive.total_served > eastFixed.total_served);
  assert.ok(balancedAdaptive.average_wait_seconds > balancedFixed.average_wait_seconds);
});

test('demand fingerprints are deterministic and settings reject invalid inputs', () => {
  const first = createDemandPlan('east_west_surge', 7);
  assert.equal(demandFingerprint(first), demandFingerprint(createDemandPlan('east_west_surge', 7)));
  assert.notEqual(demandFingerprint(first), demandFingerprint(createDemandPlan('east_west_surge', 8)));
  assert.throws(() => validateSettings({ scenario: 'unknown' }), /Invalid simulation scenario/);
  assert.throws(() => validateSettings({ seed: -1 }), /Invalid simulation seed/);
  assert.throws(() => validateSettings({ duration: 7 }), /Invalid simulation duration/);
});
