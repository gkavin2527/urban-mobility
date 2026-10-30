function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function runMetrics(row) {
  if (!row) return null;
  const total_arrived = numeric(row.total_arrived);
  const total_served = numeric(row.total_served);
  const total_wait_seconds = numeric(row.total_wait_seconds);
  return {
    ...row,
    total_arrived,
    total_served,
    total_wait_seconds,
    max_queue: numeric(row.max_queue),
    average_wait_seconds: total_arrived ? Number((total_wait_seconds / total_arrived).toFixed(2)) : 0,
  };
}

export function compareRuns(fixedRow, adaptiveRow) {
  const fixed = runMetrics(fixedRow);
  const adaptive = runMetrics(adaptiveRow);
  if (!fixed || !adaptive || fixed.status !== 'completed' || adaptive.status !== 'completed') return null;
  const demand_equal = fixed.scenario === adaptive.scenario &&
    numeric(fixed.demand_seed) === numeric(adaptive.demand_seed) &&
    numeric(fixed.duration_seconds) === numeric(adaptive.duration_seconds) &&
    fixed.demand_fingerprint === adaptive.demand_fingerprint &&
    fixed.total_arrived === adaptive.total_arrived;
  const wait_change_percent = demand_equal && fixed.average_wait_seconds > 0 ?
    Number((100 * (adaptive.average_wait_seconds - fixed.average_wait_seconds) / fixed.average_wait_seconds).toFixed(2)) : null;
  return {
    fixed,
    adaptive,
    demand_equal,
    wait_change_percent,
    method: 'Same scenario, random seed, duration, and generated arrival sequence; only signal control changes. Average wait includes time experienced by vehicles still queued at the end.',
  };
}
