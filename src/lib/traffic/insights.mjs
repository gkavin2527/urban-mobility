import {TIME_BLOCKS} from './core.mjs';

// Pure helpers behind the Overview insight cards and the road x time-block heatmap.
const MIN_READINGS = 5; // below this a "share of High readings" is mostly noise
const num = v => Number(v ?? 0);
const int = v => num(v).toLocaleString('en-US', {maximumFractionDigits: 0});

/** Picks the notable roads and time block from rows the analytics query already returns. */
export function deriveInsights({roads = [], timeBlocks = [], trend = []} = {}) {
  const cards = [];
  const busiest = roads[0];
  if (busiest) cards.push({key: 'busiest', label: 'Busiest road', title: busiest.road_name, detail: `${int(busiest.recorded_volume)} reported volume · ${busiest.area}`});

  const worst = roads.filter(r => num(r.readings) >= MIN_READINGS).sort((a, b) => num(b.high_percent) - num(a.high_percent))[0];
  if (worst && num(worst.high_percent) > 0) cards.push({key: 'congested', label: 'Most congested road', title: worst.road_name, detail: `${num(worst.high_percent).toFixed(1)}% of readings are High`, tone: 'bad'});

  const peak = [...timeBlocks].sort((a, b) => num(b.recorded_volume) - num(a.recorded_volume))[0];
  if (peak && num(peak.recorded_volume) > 0) cards.push({key: 'peak', label: 'Peak time block', title: peak.time_block, detail: `${int(peak.recorded_volume)} reported volume`});

  const changes = trend.map(r => ({...r, change: num(r.late_speed) - num(r.early_speed)}));
  const gain = [...changes].sort((a, b) => b.change - a.change)[0];
  const drop = [...changes].sort((a, b) => a.change - b.change)[0];
  const span = r => `${num(r.early_speed).toFixed(1)} → ${num(r.late_speed).toFixed(1)} (earlier vs later half)`;
  if (gain && gain.change > 0) cards.push({key: 'gain', label: 'Biggest speed gain', title: gain.road_name, detail: span(gain), tone: 'good'});
  if (drop && drop.change < 0) cards.push({key: 'drop', label: 'Biggest speed drop', title: drop.road_name, detail: span(drop), tone: 'bad'});
  return cards;
}

/** Turns flat (road, time_block) rows into one row per road with a cell per time block (null when no readings). */
export function pivotHeatmap(rows = [], blocks = TIME_BLOCKS) {
  const byRoad = new Map();
  for (const r of rows) {
    if (!byRoad.has(r.road_id)) byRoad.set(r.road_id, {road_id: r.road_id, road_name: r.road_name, cells: new Map()});
    byRoad.get(r.road_id).cells.set(r.time_block, {readings: num(r.readings), high_percent: num(r.high_percent)});
  }
  const roads = [...byRoad.values()].map(r => ({road_id: r.road_id, road_name: r.road_name, cells: blocks.map(b => ({time_block: b, ...(r.cells.get(b) ?? {readings: 0, high_percent: null})}))}));
  const max = Math.max(0, ...roads.flatMap(r => r.cells.map(c => c.high_percent ?? 0)));
  return {blocks, roads, max};
}
