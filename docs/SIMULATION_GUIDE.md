# Live junction simulation

The Simulation page runs a deterministic four-approach junction model on the local Node.js server. It records fixed-timing and adaptive-signal runs in MySQL, then compares their SQL results. This is a synthetic project scenario, **not live traffic** and not a calibrated SUMO network. The historical Kaggle observations remain in their own tables.

## What happens when you press Run

1. The browser sends `POST /api/simulation` with `action=startPair`, a scenario, and an integer seed.
2. The server calculates one arrival plan and SHA-256 fingerprint. It inserts two `simulation_run` rows: fixed and adaptive, both with the same scenario, seed, duration, and fingerprint.
3. A separate local Node.js worker runs the fixed controller, then the adaptive controller. The worker advances one simulated second at a time and writes a sample to MySQL every five simulated seconds. Each sample takes about 400 ms of wall-clock time, so a pair of 180-second runs normally takes roughly 30 seconds plus database overhead.
4. The browser polls the saved pair every 700 ms while a run is queued or running. Junction vehicles, signal colour, metrics, queue chart, and action timeline update from persisted MySQL records. Polling stops after both runs reach terminal states.
5. When both runs complete, the server queries the saved totals and average sampled queues. It confirms the demand fingerprints and arrived counts match before presenting the comparison.

The POST endpoint has a one-pair-at-a-time limit. The Stop button requests cancellation through MySQL, and the worker checks that flag after each sample. Worker progress/errors are written to the ignored `data/processed/simulation-worker.log` file.

Overview shows the latest completed pair in a separate card. Its link opens that exact comparison on the Live Simulation page. Historical Kaggle cards and filters remain sourced only from the imported CSV.

## Junction model

- Four approaches: N, S, E, W. The north–south and east–west approaches are the two green phases.
- Each generated vehicle joins its approach queue. At most one vehicle per green approach crosses the stop line every two simulated seconds.
- A phase change passes through three simulated seconds of yellow and one all-red second before the opposite green phase begins.
- Fixed control changes after 20 seconds of green. Adaptive control keeps a green phase for at least 12 seconds, switches when the opposing queue has materially greater pressure, and caps green at 38 seconds.
- Scenario demand is generated from an integer seed. The same generated arrivals feed both modes. Three presets are available: east–west surge, north–south surge, and balanced approaches.
- Average experienced wait is the cumulative number of seconds spent in queues divided by total arrivals. It includes waiting experienced by vehicles still queued at the end. `total_served` counts vehicles that crossed the stop line.
- Vehicle icons and road lines are a schematic visualization of queue and crossing state. They are not GPS positions or a real junction map.

This queue model makes a controlled SQL demonstration possible; it is not a substitute for a calibrated microsimulation. The adaptive strategy can perform worse for balanced demand, and the UI must show that result honestly.

For seed 42 and 180 simulated seconds, the pure model returns these reference values. The MySQL-backed page should reproduce them after both runs finish; these numbers alone are not proof that persistence or the browser works.

| Scenario | Mode | Arrivals | Served | Average experienced wait | Largest queue |
| --- | --- | ---: | ---: | ---: | ---: |
| East-west surge | Fixed | 201 | 97 | 49.00 s | 105 |
| East-west surge | Adaptive | 201 | 140 | 31.36 s | 62 |
| North-south surge | Fixed | 210 | 103 | 45.66 s | 107 |
| North-south surge | Adaptive | 210 | 137 | 31.52 s | 74 |
| Balanced | Fixed | 198 | 140 | 33.38 s | 63 |
| Balanced | Adaptive | 198 | 133 | 36.14 s | 70 |

## Database tables and queries

`sql/004_simulation.sql` creates four additional tables:

| Table | Stored information |
| --- | --- |
| `simulation_run` | Scenario, controller, seed, fingerprint, status, cumulative results, timestamps |
| `simulation_step` | Sampled signal state, queue, totals, and schematic vehicle JSON |
| `simulation_lane_sample` | North/south/east/west queue and cumulative arrival/served counts |
| `simulation_action` | Every signal decision, previous/next phase, queue pressure, reason |

The simulation tables are separate from `traffic_observation`, so historical Kaggle charts do not silently mix with generated data. Workbench examples:

```sql
SELECT run_id, comparison_group, scenario, control_mode, demand_seed,
       LEFT(demand_fingerprint, 12) AS demand_hash,
       status, total_arrived, total_served,
       ROUND(total_wait_seconds / NULLIF(total_arrived, 0), 2) AS average_wait_seconds,
       max_queue
FROM simulation_run
ORDER BY run_id DESC
LIMIT 10;

SELECT r.control_mode, s.sim_second, s.queue_total, s.active_phase, s.signal_state
FROM simulation_step AS s
JOIN simulation_run AS r ON r.run_id = s.run_id
WHERE r.comparison_group = 'PUT-GROUP-UUID-HERE'
ORDER BY s.sim_second, r.control_mode;

SELECT r.control_mode, a.sim_second, a.from_phase, a.to_phase,
       a.current_queue, a.opposing_queue, a.reason
FROM simulation_action AS a
JOIN simulation_run AS r ON r.run_id = a.run_id
WHERE r.comparison_group = 'PUT-GROUP-UUID-HERE'
ORDER BY r.control_mode, a.sim_second;
```

## Setup and verification

After configuring MySQL and running `npm install`, rerun `npm run db:setup` to create the simulation tables. Run `npm test` for the deterministic model and transaction checks, then `npm run typecheck`, `npm run lint`, and `npm run build`. Start `npm run dev`, open the Simulation page, and run all three scenarios with seed 42. After at least one pair finishes, run `npm run verify:simulation`. This read-only command checks demand identity, final totals, every expected five-second sample, four lane samples per step, action records, and agreement with the pure model. Compare its report with the UI and Workbench. Verify Stop, page reload/history, the Overview card, and database failure messaging.

The included code has been checked with pure Node tests, but a local MySQL service and installed npm dependencies are needed for full browser/database proof. Record those results in the acceptance log described in [SETUP_AND_ACCEPTANCE.md](SETUP_AND_ACCEPTANCE.md) after they are observed.
