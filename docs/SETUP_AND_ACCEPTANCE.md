# Setup and acceptance checklist

This guide takes a fresh clone to a verified system on a Windows machine and lists the evidence to collect along the way. Work from the folder that contains `package.json`.

## Status

The source is complete and its pure Node tests (`npm test`) were written to run without MySQL. The checks below that need a live MySQL server, a production build, or a browser have **not** been recorded yet. Treat the project as *source complete, acceptance pending* until the table in [Evidence to collect](#evidence-to-collect) is filled in with real results.

## Prerequisites

- Node.js 20.9 or newer and npm
- MySQL Server 8.0.18 or newer, running, plus MySQL Workbench for inspection
- A local MySQL account that can create the `urban_mobility` database, its tables and views, and a stored procedure. Keep the password out of chat, screenshots and Git.
- The dataset CSV in `data/raw/`. It is not stored in Git. Copy it from the machine that has it, or run `pip install kagglehub` followed by `npm run data:download`.

## Dataset

- Source: [Kaggle urban traffic dataset (Bangalore, 2023–2024)](https://www.kaggle.com/datasets/sandheepkochi/bangalore-traffic-2023-2024).
- Expected file: `data/raw/bangalore_traffic_timely_data.csv`, SHA-256 `6169001e519c47cfee22a3ddd407d1134ce9ee3febf8391f410ce2201aca08d3`.
- The inspected file has 18 columns and 33,072 data rows dated 2023-01-01 to 2024-08-09. This is a source-file inspection, not a claim that your MySQL import succeeded.
- Verify the checksum before importing:

  ```powershell
  Get-FileHash .\data\raw\bangalore_traffic_timely_data.csv -Algorithm SHA256
  ```

## Setup and checks, in order

Run each command separately, save its output, and fix errors before moving on.

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts\configure-local.ps1
npm run db:setup
npm run data:import
npm run verify:database
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

`configure-local.ps1` asks for the same host, port and username you use in Workbench (the password prompt is hidden) and writes the ignored `.env` file. If `npm install` fails because of network or proxy settings, resolve that and rerun it. The `package-lock.json` it generates is worth committing.

Then, with the dev server running:

1. Open <http://127.0.0.1:3000/api/health> and <http://127.0.0.1:3000>. Confirm the health response reports MySQL connectivity, and that Overview and Data & Provenance show the active import. Apply a road, date or time-block filter and confirm a historical metric changes.
2. In SQL Query Lab, run a JOIN/aggregate query, a CTE, a window-function query and the JSON source trace, and check the returned rows. In Views & Summaries, refresh and compare the stored daily summary. In Index Benchmark, record the actual `EXPLAIN` plans and measured time; do not assume either path wins. Export a filtered CSV and inspect it.
3. Open Live Simulation. Run a fixed/adaptive pair with seed 42 for the east–west surge and wait until **both** runs complete. Check the changing queues, signal decisions, chart, final comparison and history. Confirm the Overview's synthetic experiment card opens that same comparison.
4. From a second terminal run `npm run verify:simulation` and save its JSON output. In Workbench inspect `simulation_run`, `simulation_step`, `simulation_lane_sample` and `simulation_action`. Repeat for north–south surge and balanced demand if time permits; adaptive timing can perform worse for balanced demand.
5. Test Stop and a page reload. A stopped or failed run must not be presented as a completed comparison. If the worker fails, read `data/processed/simulation-worker.log` and the server output, fix the cause, and rerun the pair before taking screenshots.

## Evidence to collect

Connect Workbench to the **same MySQL server** used in `.env` and run the examples from [SQL_GUIDE.md](SQL_GUIDE.md) and [SIMULATION_GUIDE.md](SIMULATION_GUIDE.md).

| Check | Acceptance evidence |
| --- | --- |
| Historical import | MySQL version, active import ID, checksum, accepted/rejected rows, observation count, date bounds |
| SQL functionality | One result each for joins, CTE/window logic, views/summary refresh, and index-plan comparison |
| Website | Filtered dashboard, report export, source provenance, and a clear synthetic-simulation label |
| Simulation | Same scenario, seed and demand fingerprint for both controllers; two completed run IDs; step, lane and action rows; UI comparison; passing `verify:simulation` JSON |
| Code | Output of `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` |

Record each row in an `ACCEPTANCE_RESULTS.md` with the command, date, outcome and evidence path. A failed or skipped check stays open.

Keep in mind what the data is: `Traffic Volume` is aggregate source data, not a count of distinct vehicles; time blocks are categories; and the file has no coordinates or individual trips. The simulation is a separate demonstration. It does not control real signals or use live sensor data.

## Before committing

Confirm that `.env`, the CSV, `.next/` and `node_modules/` are untracked and absent from the commit:

```powershell
git status --short
git ls-files -ci --exclude-standard   # must print nothing
```
