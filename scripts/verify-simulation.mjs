// Read-only evidence check for a completed fixed/adaptive pair on local MySQL.
import { closePool, query } from '../src/lib/traffic/database.mjs';
import { finalSimulationState, SAMPLE_SECONDS } from '../src/lib/simulation/engine.mjs';
import { compareRuns } from '../src/lib/simulation/metrics.mjs';

try {
  const groups = await query(`SELECT comparison_group FROM simulation_run
    GROUP BY comparison_group HAVING COUNT(*)=2 AND SUM(status='completed')=2
    ORDER BY MAX(run_id) DESC LIMIT 1`);
  if (!groups.length) throw new Error('No completed simulation pair exists. Run fixed + adaptive in the website first.');

  const group = groups[0].comparison_group;
  const runs = await query(`SELECT run_id,comparison_group,scenario,control_mode,demand_seed,
    demand_fingerprint,duration_seconds,status,total_arrived,total_served,total_wait_seconds,
    max_queue FROM simulation_run WHERE comparison_group=?
    ORDER BY FIELD(control_mode,'fixed','adaptive')`, [group]);
  if (runs.length !== 2 || runs[0].control_mode !== 'fixed' || runs[1].control_mode !== 'adaptive') {
    throw new Error('The latest comparison does not contain one fixed and one adaptive run.');
  }

  const comparison = compareRuns(runs[0], runs[1]);
  const checks = { same_generated_demand: comparison?.demand_equal === true };
  const evidence = [];
  for (const run of runs) {
    const expected = finalSimulationState({
      scenario: run.scenario, mode: run.control_mode,
      seed: Number(run.demand_seed), duration: Number(run.duration_seconds),
    });
    const [steps] = await query(`SELECT COUNT(*) AS count,MIN(sim_second) AS first_second,
      MAX(sim_second) AS last_second FROM simulation_step WHERE run_id=?`, [run.run_id]);
    const [lanes] = await query('SELECT COUNT(*) AS count FROM simulation_lane_sample WHERE run_id=?', [run.run_id]);
    const [actions] = await query('SELECT COUNT(*) AS count FROM simulation_action WHERE run_id=?', [run.run_id]);
    const [last] = await query(`SELECT sim_second,total_arrived,total_served,total_wait_seconds,max_queue
      FROM simulation_step WHERE run_id=? ORDER BY sim_second DESC LIMIT 1`, [run.run_id]);
    const sampleCount = Number(run.duration_seconds) / SAMPLE_SECONDS;
    const valid = run.demand_fingerprint === expected.demand_fingerprint &&
      Number(run.total_arrived) === expected.total_arrived &&
      Number(run.total_served) === expected.total_served &&
      Number(run.total_wait_seconds) === expected.total_wait_seconds &&
      Number(run.max_queue) === expected.max_queue &&
      Number(steps.count) === sampleCount && Number(steps.first_second) === SAMPLE_SECONDS &&
      Number(steps.last_second) === Number(run.duration_seconds) &&
      Number(lanes.count) === sampleCount * 4 && Number(actions.count) > 0 &&
      Number(last?.total_arrived) === Number(run.total_arrived) &&
      Number(last?.total_served) === Number(run.total_served) &&
      Number(last?.total_wait_seconds) === Number(run.total_wait_seconds) &&
      Number(last?.max_queue) === Number(run.max_queue);
    checks[`${run.control_mode}_matches_engine_and_samples`] = valid;
    evidence.push({
      run_id: run.run_id, mode: run.control_mode, scenario: run.scenario,
      seed: run.demand_seed, duration_seconds: run.duration_seconds,
      arrivals: run.total_arrived, served: run.total_served,
      average_wait_seconds: comparison?.[run.control_mode]?.average_wait_seconds,
      sampled_steps: steps.count, lane_samples: lanes.count, recorded_actions: actions.count,
    });
  }

  const verified = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    status: verified ? 'verified' : 'review required',
    comparison_group: group,
    checks,
    adaptive_wait_change_percent: comparison?.wait_change_percent ?? null,
    evidence,
  }, null, 2));
  if (!verified) process.exitCode = 1;
} catch (error) {
  console.error('Simulation verification failed:', error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
