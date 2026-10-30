import { setTimeout as delay } from 'node:timers/promises';
import { closePool, getPool, query } from '../src/lib/traffic/database.mjs';
import { SAMPLE_SECONDS, simulationSteps, validateSettings, WALL_MS_PER_SAMPLE } from '../src/lib/simulation/engine.mjs';
import { recordSample } from '../src/lib/simulation/persistence.mjs';

const runIds = process.argv.slice(2);
if (runIds.length !== 2 || runIds.some(id => !/^[1-9]\d*$/.test(id))) {
  throw new Error('Expected two valid simulation run IDs');
}

async function executeRun(runId) {
  const db = await getPool().getConnection();
  try {
    const [rows] = await db.execute(`SELECT run_id,scenario,control_mode,demand_seed,demand_fingerprint,
      duration_seconds,status,stop_requested FROM simulation_run WHERE run_id=?`, [runId]);
    const run = rows[0];
    if (!run || run.status !== 'queued') throw new Error(`Simulation run ${runId} is not queued`);
    if (run.stop_requested) {
      await db.execute("UPDATE simulation_run SET status='stopped',finished_at=UTC_TIMESTAMP(6) WHERE run_id=?", [runId]);
      return;
    }
    const settings = validateSettings({
      scenario: run.scenario, mode: run.control_mode,
      seed: run.demand_seed, duration: run.duration_seconds,
    });
    await db.execute(`UPDATE simulation_run SET status='running',started_at=UTC_TIMESTAMP(6),
      heartbeat_at=UTC_TIMESTAMP(6) WHERE run_id=?`, [runId]);
    console.log('Simulation started', { runId, mode: run.control_mode, scenario: run.scenario });
    let actions = [], last;
    for (const state of simulationSteps(settings)) {
      if (state.demand_fingerprint !== run.demand_fingerprint) throw new Error('Demand fingerprint mismatch');
      actions.push(...state.actions);
      last = state;
      if (state.sim_second % SAMPLE_SECONDS !== 0) continue;
      await recordSample(db, runId, state, actions);
      actions = [];
      const [check] = await db.execute('SELECT stop_requested FROM simulation_run WHERE run_id=?', [runId]);
      if (check[0].stop_requested) {
        await db.execute("UPDATE simulation_run SET status='stopped',finished_at=UTC_TIMESTAMP(6) WHERE run_id=?", [runId]);
        console.log('Simulation stopped', { runId, second: state.sim_second });
        return;
      }
      if (state.sim_second < settings.duration) await delay(WALL_MS_PER_SAMPLE);
    }
    await db.execute(`UPDATE simulation_run SET status='completed',finished_at=UTC_TIMESTAMP(6),
      heartbeat_at=UTC_TIMESTAMP(6) WHERE run_id=?`, [runId]);
    console.log('Simulation completed', {
      runId, arrived: last.total_arrived, served: last.total_served,
      averageWaitSeconds: last.average_wait_seconds,
    });
  } finally {
    db.release();
  }
}

try {
  for (const id of runIds) await executeRun(id);
} catch (error) {
  console.error('Simulation worker failed', { code: error.code || 'WORKER_ERROR', message: error.message });
  try {
    await query(`UPDATE simulation_run SET status='failed',error_message='Simulation worker failed; inspect the local worker log',
      finished_at=UTC_TIMESTAMP(6) WHERE run_id IN (?,?) AND status IN ('queued','running')`, runIds);
  } catch (updateError) {
    console.error('Could not mark simulation failure', { code: updateError.code || 'UPDATE_ERROR' });
  }
  process.exitCode = 1;
} finally {
  await closePool();
}
