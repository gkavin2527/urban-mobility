import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPool, query } from '../traffic/database.mjs';
import { createDemandPlan, DEFAULT_DURATION, demandFingerprint, SCENARIOS, validateSettings } from './engine.mjs';
import { compareRuns } from './metrics.mjs';

const groupPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkGroup(group) {
  if (typeof group !== 'string' || !groupPattern.test(group)) throw new Error('Invalid simulation group');
  return group;
}

async function markSpawnFailure(group) {
  await query(`UPDATE simulation_run SET status='failed',error_message='Simulation worker could not start',finished_at=UTC_TIMESTAMP(6)
    WHERE comparison_group=? AND status='queued'`, [group]);
}

async function launchWorker(group, runIds) {
  const logDir = resolve(process.cwd(), 'data', 'processed');
  mkdirSync(logDir, { recursive: true });
  const log = openSync(resolve(logDir, 'simulation-worker.log'), 'a');
  const script = resolve(process.cwd(), 'scripts', 'simulation-worker.mjs');
  try {
    const child = spawn(process.execPath, [script, ...runIds.map(String)], {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log, log],
      env: process.env,
    });
    await new Promise((resolveSpawn, rejectSpawn) => {
      child.once('spawn', resolveSpawn);
      child.once('error', rejectSpawn);
    });
    child.unref();
  } catch (error) {
    await markSpawnFailure(group);
    throw error;
  } finally {
    closeSync(log);
  }
}

export async function startComparison(input = {}) {
  const settings = validateSettings({
    scenario: input.scenario,
    seed: input.seed,
    duration: input.duration ?? DEFAULT_DURATION,
    mode: 'fixed',
  });
  const fingerprint = demandFingerprint(createDemandPlan(settings.scenario, settings.seed, settings.duration));
  const group = randomUUID();
  const db = await getPool().getConnection();
  const ids = [];
  try {
    await db.beginTransaction();
    await db.execute('SELECT singleton_id FROM app_state WHERE singleton_id=1 FOR UPDATE');
    await db.execute(`UPDATE simulation_run SET status='failed',error_message='Worker heartbeat expired',finished_at=UTC_TIMESTAMP(6)
      WHERE status='running' AND heartbeat_at < UTC_TIMESTAMP(6) - INTERVAL 2 MINUTE`);
    await db.execute(`UPDATE simulation_run SET status='failed',error_message='Worker did not start',finished_at=UTC_TIMESTAMP(6)
      WHERE status='queued' AND created_at < UTC_TIMESTAMP(6) - INTERVAL 2 MINUTE`);
    const [active] = await db.execute("SELECT COUNT(*) AS active_count FROM simulation_run WHERE status IN ('queued','running')");
    if (Number(active[0].active_count) > 0) throw new Error('A simulation is already running');
    for (const mode of ['fixed', 'adaptive']) {
      const [result] = await db.execute(`INSERT INTO simulation_run
        (comparison_group,scenario,control_mode,demand_seed,demand_fingerprint,duration_seconds)
        VALUES (?,?,?,?,?,?)`, [group, settings.scenario, mode, settings.seed, fingerprint, settings.duration]);
      ids.push(result.insertId);
    }
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
  await launchWorker(group, ids);
  return { comparison_group: group, fixed_run_id: ids[0], adaptive_run_id: ids[1], settings, demand_fingerprint: fingerprint };
}

export async function simulationOverview() {
  const recent = await query(`SELECT comparison_group,MAX(run_id) AS latest_run,
    MAX(scenario) AS scenario,MAX(demand_seed) AS demand_seed,
    SUM(status='completed') AS completed_runs,SUM(status IN ('queued','running')) AS active_runs,
    MAX(created_at) AS created_at
    FROM simulation_run GROUP BY comparison_group ORDER BY latest_run DESC LIMIT 8`);
  const latestGroups = await query(`SELECT comparison_group FROM simulation_run
    GROUP BY comparison_group HAVING COUNT(*)=2 AND SUM(status='completed')=2
    ORDER BY MAX(run_id) DESC LIMIT 1`);
  let latest_comparison = null;
  if (latestGroups.length) {
    const runs = await query(`SELECT run_id,comparison_group,scenario,control_mode,demand_seed,
      demand_fingerprint,duration_seconds,status,total_arrived,total_served,total_wait_seconds,
      max_queue,finished_at FROM simulation_run WHERE comparison_group=?
      ORDER BY FIELD(control_mode,'fixed','adaptive')`, [latestGroups[0].comparison_group]);
    if (runs.length === 2) {
      const comparison = compareRuns(runs[0], runs[1]);
      if (comparison) latest_comparison = {
        comparison_group: latestGroups[0].comparison_group,
        scenario: runs[0].scenario,
        finished_at: runs[1].finished_at,
        ...comparison,
      };
    }
  }
  return {
    recent,
    latest_comparison,
    scenarios: Object.entries(SCENARIOS).map(([id, value]) => ({ id, title: value.title, description: value.description })),
    defaults: { seed: 42, duration: DEFAULT_DURATION },
    model: 'Deterministic four-approach queue simulation. Each run is a synthetic scenario, not live city traffic or a calibrated SUMO model.',
  };
}

export async function getComparison(groupValue) {
  const group = checkGroup(groupValue);
  const runs = await query(`SELECT run_id,comparison_group,scenario,control_mode,demand_seed,demand_fingerprint,
    duration_seconds,status,sim_second,total_arrived,total_served,total_wait_seconds,max_queue,
    stop_requested,error_message,created_at,started_at,finished_at,heartbeat_at
    FROM simulation_run WHERE comparison_group=? ORDER BY FIELD(control_mode,'fixed','adaptive')`, [group]);
  if (runs.length !== 2) throw new Error('Simulation comparison not found');
  const [fixed, adaptive] = runs;
  const current = adaptive.started_at || Number(adaptive.sim_second) > 0 ? adaptive : fixed;
  const [steps, actions, totals] = await Promise.all([
    query(`SELECT run_id,sim_second,active_phase,signal_state,queue_total,total_arrived,total_served,
      total_wait_seconds,max_queue,vehicle_state FROM simulation_step WHERE run_id IN (?,?)
      ORDER BY run_id,sim_second LIMIT 150`, [fixed.run_id, adaptive.run_id]),
    query(`SELECT a.sim_second,a.from_phase,a.to_phase,a.reason,a.current_queue,a.opposing_queue,
      r.control_mode FROM simulation_action a JOIN simulation_run r ON r.run_id=a.run_id
      WHERE r.comparison_group=? ORDER BY a.action_id DESC LIMIT 15`, [group]),
    query(`SELECT r.control_mode,r.scenario,r.demand_seed,r.duration_seconds,r.demand_fingerprint,
      r.status,r.total_arrived,r.total_served,r.total_wait_seconds,r.max_queue,
      ROUND((SELECT AVG(s.queue_total) FROM simulation_step s WHERE s.run_id=r.run_id),2) AS average_queue
      FROM simulation_run r WHERE r.comparison_group=?`, [group]),
  ]);
  const byMode = Object.fromEntries(totals.map(row => [row.control_mode, row]));
  const comparison = compareRuns(byMode.fixed, byMode.adaptive);
  return {
    comparison_group: group,
    runs,
    current_run_id: current.run_id,
    steps: steps.map(row => ({ ...row, vehicle_state: typeof row.vehicle_state === 'string' ? JSON.parse(row.vehicle_state) : row.vehicle_state })),
    actions: actions.reverse(),
    comparison,
  };
}

export async function stopComparison(groupValue) {
  const group = checkGroup(groupValue);
  await query(`UPDATE simulation_run SET stop_requested=1 WHERE comparison_group=? AND status IN ('queued','running')`, [group]);
  return getComparison(group);
}
