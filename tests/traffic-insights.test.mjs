import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveInsights, pivotHeatmap} from '../src/lib/traffic/insights.mjs';

test('insights pick busiest, most congested (enough readings), peak block and speed movers', () => {
  const cards = deriveInsights({
    roads: [
      {road_name: 'A', area: 'X', recorded_volume: 9000, readings: 40, high_percent: 10},
      {road_name: 'B', area: 'X', recorded_volume: 5000, readings: 40, high_percent: 55},
      {road_name: 'Tiny', area: 'Y', recorded_volume: 10, readings: 1, high_percent: 100},
    ],
    timeBlocks: [{time_block: 'Morning', recorded_volume: 100}, {time_block: 'Evening', recorded_volume: 300}],
    trend: [{road_name: 'A', early_speed: 40, late_speed: 44}, {road_name: 'B', early_speed: 40, late_speed: 33}],
  });
  const by = Object.fromEntries(cards.map(c => [c.key, c.title]));
  assert.deepEqual(by, {busiest: 'A', congested: 'B', peak: 'Evening', gain: 'A', drop: 'B'});
});

test('insights stay silent when there is nothing to say', () => {
  assert.deepEqual(deriveInsights({}), []);
  const flat = deriveInsights({trend: [{road_name: 'A', early_speed: 40, late_speed: 40}]});
  assert.equal(flat.length, 0); // no gain or drop claimed for an unchanged road
});

test('heatmap pivots to one row per road with a cell per time block', () => {
  const grid = pivotHeatmap([
    {road_id: 1, road_name: 'A', time_block: 'Morning', readings: 4, high_percent: 25},
    {road_id: 1, road_name: 'A', time_block: 'Night', readings: 2, high_percent: 50},
    {road_id: 2, road_name: 'B', time_block: 'Morning', readings: 3, high_percent: 0},
  ]);
  assert.equal(grid.roads.length, 2);
  assert.equal(grid.roads[0].cells.length, grid.blocks.length);
  assert.equal(grid.roads[0].cells.find(c => c.time_block === 'Night').high_percent, 50);
  assert.equal(grid.roads[1].cells.find(c => c.time_block === 'Night').high_percent, null); // no readings
  assert.equal(grid.max, 50);
});
