import { APPROACHES } from './engine.mjs';

export async function recordSample(db, runId, state, actions) {
  await db.beginTransaction();
  try {
    await db.execute(`INSERT INTO simulation_step
      (run_id,sim_second,active_phase,signal_state,queue_total,total_arrived,total_served,
       total_wait_seconds,max_queue,vehicle_state) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
      runId, state.sim_second, state.phase, state.signal, state.queue_total,
      state.total_arrived, state.total_served, state.total_wait_seconds, state.max_queue,
      JSON.stringify({ lanes: state.lanes, vehicles: state.vehicles }),
    ]);
    for (const approach of APPROACHES) {
      const lane = state.lanes[approach];
      await db.execute(`INSERT INTO simulation_lane_sample
        (run_id,sim_second,approach,queue_length,arrivals_total,served_total)
        VALUES (?,?,?,?,?,?)`, [runId, state.sim_second, approach, lane.queue, lane.arrived, lane.served]);
    }
    for (const action of actions) {
      await db.execute(`INSERT INTO simulation_action
        (run_id,sim_second,from_phase,to_phase,reason,current_queue,opposing_queue)
        VALUES (?,?,?,?,?,?,?)`, [
        runId, action.sim_second, action.from_phase, action.to_phase,
        action.reason, action.current_queue, action.opposing_queue,
      ]);
    }
    await db.execute(`UPDATE simulation_run SET sim_second=?,total_arrived=?,total_served=?,
      total_wait_seconds=?,max_queue=?,heartbeat_at=UTC_TIMESTAMP(6) WHERE run_id=?`, [
      state.sim_second, state.total_arrived, state.total_served,
      state.total_wait_seconds, state.max_queue, runId,
    ]);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
