import { createHash } from 'node:crypto';

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

export const DEFAULT_DURATION = 180;
export const SAMPLE_SECONDS = 5;
export const WALL_MS_PER_SAMPLE = 400;

export function validateSettings(input = {}) {
  const scenario = input.scenario ?? 'east_west_surge';
  const mode = input.mode ?? 'fixed';
  const seed = Number(input.seed ?? 42);
  const duration = Number(input.duration ?? DEFAULT_DURATION);
  if (!Object.hasOwn(SCENARIOS, scenario)) throw new Error('Invalid simulation scenario');
  if (!['fixed', 'adaptive'].includes(mode)) throw new Error('Invalid simulation mode');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Invalid simulation seed');
  if (!Number.isInteger(duration) || duration < 60 || duration > 360 || duration % SAMPLE_SECONDS !== 0) {
    throw new Error('Invalid simulation duration');
  }
  return { scenario, mode, seed, duration };
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createDemandPlan(scenario, seed, duration = DEFAULT_DURATION) {
  validateSettings({ scenario, seed, duration });
  const random = randomGenerator(seed);
  const rates = SCENARIOS[scenario].rates;
  const plan = [];
  for (let second = 1; second <= duration; second++) {
    const wave = second >= duration / 4 && second < duration * 3 / 4 ? 1.25 : 0.85;
    const arrivals = {};
    for (const approach of APPROACHES) {
      const demand = rates[approach] * wave;
      arrivals[approach] = Math.floor(demand) + (random() < demand % 1 ? 1 : 0);
    }
    plan.push(arrivals);
  }
  return plan;
}

export function demandFingerprint(plan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

const opposite = phase => phase === 'NS' ? 'EW' : 'NS';
const phaseApproaches = phase => phase === 'NS' ? ['N', 'S'] : ['E', 'W'];

/**
 * A small, reproducible queue model. One vehicle may pass from each green
 * approach every two simulated seconds. Yellow and all-red prevent discharge.
 * It is a project scenario, not a calibrated model of a real junction.
 */
export function* simulationSteps(input = {}) {
  const settings = validateSettings(input);
  const demand = createDemandPlan(settings.scenario, settings.seed, settings.duration);
  const fingerprint = demandFingerprint(demand);
  const queues = Object.fromEntries(APPROACHES.map(lane => [lane, []]));
  const arrivedByLane = Object.fromEntries(APPROACHES.map(lane => [lane, 0]));
  const servedByLane = Object.fromEntries(APPROACHES.map(lane => [lane, 0]));
  const crossing = [];
  let phase = 'NS', signal = 'green', phaseAge = 0, nextPhase = 'EW';
  let totalArrived = 0, totalServed = 0, totalWaitSeconds = 0, maxQueue = 0;

  for (let second = 1; second <= settings.duration; second++) {
    const arrivals = demand[second - 1];
    for (const lane of APPROACHES) {
      for (let index = 0; index < arrivals[lane]; index++) {
        queues[lane].push({ id: `${second}-${lane}-${index}`, arrivedAt: second });
        arrivedByLane[lane]++;
        totalArrived++;
      }
    }

    for (let index = crossing.length - 1; index >= 0; index--) {
      crossing[index].remaining--;
      if (crossing[index].remaining <= 0) crossing.splice(index, 1);
    }

    if (signal === 'green' && second % 2 === 0) {
      for (const lane of phaseApproaches(phase)) {
        const vehicle = queues[lane].shift();
        if (vehicle) {
          crossing.push({ id: vehicle.id, lane, remaining: 6 });
          servedByLane[lane]++;
          totalServed++;
        }
      }
    }

    const queueTotal = APPROACHES.reduce((sum, lane) => sum + queues[lane].length, 0);
    totalWaitSeconds += queueTotal;
    maxQueue = Math.max(maxQueue, queueTotal);
    phaseAge++;
    const actions = [];

    if (signal === 'green') {
      const current = phaseApproaches(phase).reduce((sum, lane) => sum + queues[lane].length, 0);
      const other = phaseApproaches(opposite(phase)).reduce((sum, lane) => sum + queues[lane].length, 0);
      const fixedSwitch = settings.mode === 'fixed' && phaseAge >= 20;
      const adaptiveSwitch = settings.mode === 'adaptive' && phaseAge >= 12 &&
        (phaseAge >= 38 || (other >= current + 2 && other > current * 1.25));
      if (fixedSwitch || adaptiveSwitch) {
        nextPhase = opposite(phase);
        actions.push({
          sim_second: second,
          from_phase: phase,
          to_phase: nextPhase,
          reason: settings.mode === 'fixed' ? 'Fixed 20-second green interval' :
            phaseAge >= 38 ? 'Maximum 38-second green reached' :
              `Queue pressure: ${other} waiting for ${nextPhase} versus ${current} on ${phase}`,
          current_queue: current,
          opposing_queue: other,
        });
        signal = 'yellow';
        phaseAge = 0;
      }
    } else if (signal === 'yellow' && phaseAge >= 3) {
      signal = 'all_red';
      phaseAge = 0;
    } else if (signal === 'all_red' && phaseAge >= 1) {
      phase = nextPhase;
      signal = 'green';
      phaseAge = 0;
    }

    const lanes = Object.fromEntries(APPROACHES.map(lane => [lane, {
      queue: queues[lane].length,
      arrived: arrivedByLane[lane],
      served: servedByLane[lane],
    }]));
    const vehicles = [
      ...APPROACHES.flatMap(lane => queues[lane].slice(0, 6).map((vehicle, index) => ({
        id: vehicle.id, lane, state: 'queued', position: index,
      }))),
      ...crossing.map(vehicle => ({
        id: vehicle.id, lane: vehicle.lane, state: 'crossing', position: 1 - vehicle.remaining / 6,
      })),
    ];
    yield {
      sim_second: second,
      phase,
      signal,
      lanes,
      vehicles,
      queue_total: queueTotal,
      total_arrived: totalArrived,
      total_served: totalServed,
      total_wait_seconds: totalWaitSeconds,
      average_wait_seconds: Number((totalWaitSeconds / Math.max(1, totalArrived)).toFixed(2)),
      max_queue: maxQueue,
      actions,
      demand_fingerprint: fingerprint,
    };
  }
}

export function finalSimulationState(settings) {
  let last;
  for (const state of simulationSteps(settings)) last = state;
  return last;
}
