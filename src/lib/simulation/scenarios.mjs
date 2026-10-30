// Pure scenario definitions (no Node imports), shared by the engine, the API and the UI.
export const APPROACHES = ['N', 'S', 'E', 'W'];
export const SCENARIOS = {
  east_west_surge: {
    title: 'East–west surge',
    description: 'A busy cross street meets a quieter north–south approach.',
    rates: { N: 0.09, S: 0.10, E: 0.51, W: 0.47 },
  },
  north_south_surge: {
    title: 'North–south surge',
    description: 'The primary north–south street carries most arrivals.',
    rates: { N: 0.49, S: 0.52, E: 0.10, W: 0.09 },
  },
  balanced: {
    title: 'Balanced approaches',
    description: 'All four approaches receive similar traffic demand.',
    rates: { N: 0.29, S: 0.27, E: 0.28, W: 0.29 },
  },
};

// Dataset-derived demand: the balanced mix, scaled by how busy a time block is in the imported data.
// The scale is encoded in the id (peak_x168 = 1.68x) so a stored run can always be replayed and verified.
const DERIVED = /^(peak|offpeak)_x(\d{2,3})$/;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2;
const clamp = value => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
const times = scale => `×${scale.toFixed(2)}`;

/** The scenario definition for a built-in or dataset-derived id, or null if the id is not valid. */
export function resolveScenario(id) {
  if (Object.hasOwn(SCENARIOS, id)) return SCENARIOS[id];
  const match = typeof id === 'string' ? DERIVED.exec(id) : null;
  if (!match) return null;
  const scale = Number(match[2]) / 100;
  if (scale < MIN_SCALE || scale > MAX_SCALE) return null;
  const base = SCENARIOS.balanced.rates;
  return {
    title: `Dataset ${match[1] === 'peak' ? 'peak' : 'off-peak'} demand ${times(scale)}`,
    description: 'Balanced approaches scaled to a time block of the imported dataset.',
    rates: Object.fromEntries(APPROACHES.map(lane => [lane, base[lane] * scale])),
  };
}

/** Human label for any stored scenario id. */
export function scenarioLabel(id) {
  return resolveScenario(id)?.title ?? String(id).replaceAll('_', ' ');
}

/**
 * Builds the peak and off-peak scenarios from per-time-block average volumes
 * ([{ time_block, avg_volume }]). Each scale is the block's average relative to the mean of all blocks.
 */
export function derivedScenarios(blocks = []) {
  const rows = blocks.map(b => ({ time_block: b.time_block, volume: Number(b.avg_volume) })).filter(b => b.volume > 0);
  if (rows.length < 2) return [];
  const mean = rows.reduce((sum, b) => sum + b.volume, 0) / rows.length;
  const busiest = rows.reduce((a, b) => (b.volume > a.volume ? b : a));
  const quietest = rows.reduce((a, b) => (b.volume < a.volume ? b : a));
  return [['peak', busiest, 'busiest'], ['offpeak', quietest, 'quietest']].map(([kind, block, word]) => {
    const scale = clamp(Math.round((block.volume / mean) * 100) / 100);
    const id = `${kind}_x${Math.round(scale * 100)}`;
    return {
      id,
      title: `Dataset ${kind === 'peak' ? 'peak' : 'off-peak'}: ${block.time_block} ${times(scale)}`,
      description: `Balanced approaches scaled to the dataset's ${word} time block (${block.time_block}, average reported volume ${times(block.volume / mean)} the all-block mean). The data has no direction, so the mix stays balanced; arrivals are still generated and synthetic.`,
    };
  });
}
