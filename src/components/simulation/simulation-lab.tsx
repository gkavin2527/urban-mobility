"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CircleHelp, GitCompareArrows, LoaderCircle, Pause, Play, RefreshCw, TrafficCone } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { scenarioLabel } from "@/lib/simulation/scenarios.mjs";

type Row = Record<string, any>;
const format = (value: any, digits = 0) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
const terminal = (status: string) => ["completed", "stopped", "failed"].includes(status);

async function request(action: string, options: Row = {}) {
  const { method = "GET", ...values } = options;
  const url = method === "GET" ? `/api/simulation?${new URLSearchParams({ action, ...values })}` : "/api/simulation";
  const response = await fetch(url, method === "GET" ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...values }), cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Simulation request failed (${response.status})`);
  return result;
}

export function SimulationLab({ initialGroup = "" }: { initialGroup?: string }) {
  const [overview, setOverview] = useState<Row | null>(null);
  const [group, setGroup] = useState(initialGroup);
  const [pair, setPair] = useState<Row | null>(null);
  const [scenario, setScenario] = useState("east_west_surge");
  const [seed, setSeed] = useState("42");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const reloadOverview = useCallback(async () => {
    try {
      const value = await request("overview");
      setOverview(value);
      setGroup(old => old || value.recent?.[0]?.comparison_group || "");
      setError("");
    } catch (cause) { setError((cause as Error).message); }
  }, []);
  const reloadPair = useCallback(async () => {
    if (!group) return;
    try { setPair(await request("pair", { group })); setError(""); }
    catch (cause) { setError((cause as Error).message); }
  }, [group]);

  useEffect(() => {
    let alive = true;
    request("overview")
      .then(value => {
        if (!alive) return;
        setOverview(value);
        setGroup(old => old || value.recent?.[0]?.comparison_group || "");
      })
      .catch(cause => { if (alive) setError((cause as Error).message); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      try {
        const value = await request("pair", { group });
        if (cancelled) return;
        setPair(value);
        setError("");
        if (value.runs?.some((run: Row) => !terminal(run.status))) {
          timer = window.setTimeout(() => { void poll(); }, 700);
        } else {
          void reloadOverview();
        }
      } catch (cause) {
        if (cancelled) return;
        setError((cause as Error).message);
        timer = window.setTimeout(() => { void poll(); }, 2500);
      }
    }
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [group, reloadOverview]);

  async function start() {
    setWorking(true); setError("");
    try {
      const result = await request("startPair", { method: "POST", scenario, seed: Number(seed) });
      setPair(null);
      setGroup(result.comparison_group);
      await reloadOverview();
    } catch (cause) { setError((cause as Error).message); }
    finally { setWorking(false); }
  }

  async function stop() {
    setWorking(true); setError("");
    try { setPair(await request("stopPair", { method: "POST", group })); }
    catch (cause) { setError((cause as Error).message); }
    finally { setWorking(false); }
  }

  const scenarioNote = (overview?.scenarios ?? []).find((item: Row) => item.id === scenario)?.description;
  const runs: Row[] = pair?.runs || [];
  const fixed = runs.find(run => run.control_mode === "fixed");
  const adaptive = runs.find(run => run.control_mode === "adaptive");
  const active = runs.some(run => !terminal(run.status));
  const anotherActive = (overview?.recent || []).some((item: Row) => Number(item.active_runs) > 0);
  const failed = runs.find(run => run.status === "failed");
  const current = runs.find(run => String(run.run_id) === String(pair?.current_run_id));
  const currentSteps: Row[] = (pair?.steps || []).filter((step: Row) => String(step.run_id) === String(current?.run_id));
  const latest = currentSteps.at(-1);
  const chartData = useMemo(() => {
    const values = new Map<number, Row>();
    for (const step of pair?.steps || []) {
      const second = Number(step.sim_second);
      const value = values.get(second) || { second };
      const mode = String(step.run_id) === String(fixed?.run_id) ? "fixed" : "adaptive";
      value[`${mode}_queue`] = step.queue_total;
      values.set(second, value);
    }
    return [...values.values()].sort((a, b) => a.second - b.second);
  }, [pair?.steps, fixed?.run_id]);

  return <div className="sim-root">
    <div className="sim-disclosure"><CircleHelp size={17} />
      <span>A <b>synthetic four-way junction</b>: vehicles are generated from a seed, and both controllers get the same 180 simulated seconds of arrivals. The model is deterministic and uncalibrated, so results do not estimate real traffic. Runs are stored in their own MySQL tables, apart from the historical data.</span>
    </div>

    <div className="sim-controls">
      <label>Traffic scenario<select value={scenario} onChange={event => setScenario(event.target.value)} disabled={working || active}>
        {(overview?.scenarios || []).map((item: Row) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <label>Random seed<input type="number" min="0" max="4294967295" step="1" value={seed} onChange={event => setSeed(event.target.value)} disabled={working || active} /></label>
      <button className="sim-primary" onClick={() => void start()} disabled={working || active || anotherActive || !overview}>
        {working ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />} Run fixed + adaptive
      </button>
      {active && <button className="sim-secondary" onClick={() => void stop()} disabled={working}><Pause size={15} /> Stop runs</button>}
      <button className="sim-icon-button" onClick={() => { void reloadOverview(); void reloadPair(); }} aria-label="Refresh simulation data"><RefreshCw size={16} /></button>
    </div>
    {scenarioNote && <p className="sim-helper">{scenarioNote}</p>}
    {error && <div className="sim-error"><CircleHelp size={16} />{error}</div>}

    {(overview?.recent?.length ?? 0) > 0 && <div className="sim-history"><span>Recent comparisons</span>
      {((overview?.recent ?? []) as Row[]).map(item => <button className={group === item.comparison_group ? "selected" : ""}
        key={item.comparison_group} onClick={() => { setGroup(item.comparison_group); setPair(null); }}>
        {scenarioLabel(item.scenario)} · seed {item.demand_seed} · {group === item.comparison_group && pair ? runs.filter(run => run.status === "completed").length : item.completed_runs}/2 complete
      </button>)}
    </div>}

    {!group && !error && <div className="sim-empty"><TrafficCone size={32} /><h2>Start a junction comparison</h2>
      <p>Watch two signal strategies handle identical generated traffic, then compare their recorded SQL metrics.</p></div>}

    {pair && <>
      <div className="sim-progress">
        {[fixed, adaptive].map(run => <div className={`sim-progress-card ${run?.status || "queued"}`} key={run?.control_mode}>
          <span className="sim-progress-dot" /><div><b>{run?.control_mode === "fixed" ? "Fixed timing" : "Adaptive timing"}</b>
          <small>{run?.status || "queued"} · {run?.sim_second || 0}/{run?.duration_seconds || 180} simulated seconds</small></div>
          <strong>{format(run?.total_served)} served</strong>
        </div>)}
      </div>
      {failed && <div className="sim-error"><CircleHelp size={16} />{failed.error_message || "A simulation run failed. Check the local worker log."}</div>}

      <div className="sim-main-grid">
        <section className="sim-panel sim-junction-panel"><div className="sim-panel-header"><div><h2>Live junction</h2><p>Vehicle positions are schematic; the queue and signal state come from the latest stored simulation step.</p></div><span className="sim-live-badge"><i />{current?.status === "running" ? "RUNNING" : String(current?.status || "QUEUED").toUpperCase()}</span></div>
          <Junction snapshot={latest} />
          <div className="sim-junction-footer"><span><b>{current?.control_mode === "fixed" ? "Fixed" : "Adaptive"}</b> controller</span><span>Simulation clock <b>{latest?.sim_second || 0}s</b></span><span>Seed <b>{current?.demand_seed}</b></span></div>
        </section>
        <div className="sim-side">
          <div className="sim-metrics">
            <SimMetric label="Vehicles arrived" value={format(latest?.total_arrived)} hint="Generated demand" />
            <SimMetric label="Vehicles served" value={format(latest?.total_served)} hint="Passed the junction" />
            <SimMetric label="Current queue" value={format(latest?.queue_total)} hint="All four approaches" />
            <SimMetric label="Average wait" value={`${format(Number(latest?.total_wait_seconds || 0) / Math.max(1, Number(latest?.total_arrived || 0)), 1)}s`} hint="Experienced per arrival" />
          </div>
          <section className="sim-panel sim-lane-panel"><div className="sim-panel-header"><div><h2>Approach queues</h2><p>Latest sampled MySQL values</p></div></div>
            {["N", "S", "E", "W"].map(lane => <div className="sim-lane-row" key={lane}><span>{lane}</span><div className="sim-lane-track"><i style={{ width: `${Math.min(100, Number(latest?.vehicle_state?.lanes?.[lane]?.queue || 0) * 6)}%` }} /></div><b>{latest?.vehicle_state?.lanes?.[lane]?.queue || 0}</b></div>)}
          </section>
        </div>
      </div>

      <section className="sim-panel"><div className="sim-panel-header"><div><h2>Queue over simulated time</h2><p>Both lines use the same generated arrivals. Values are stored in `simulation_step`.</p></div></div>
        <div className="sim-chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}>
          <CartesianGrid stroke="#e9eff5" vertical={false} /><XAxis dataKey="second" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={35} />
          <Tooltip formatter={(value: any) => format(value)} labelFormatter={label => `${label} simulated seconds`} />
          <Legend /><Line type="monotone" name="Fixed queue" dataKey="fixed_queue" stroke="#d89446" strokeWidth={2.5} dot={false} connectNulls />
          <Line type="monotone" name="Adaptive queue" dataKey="adaptive_queue" stroke="#317ac7" strokeWidth={2.5} dot={false} connectNulls />
        </LineChart></ResponsiveContainer> : <div className="sim-chart-empty">Waiting for the first stored sample…</div>}</div>
      </section>

      <div className="sim-bottom-grid">
        <section className="sim-panel"><div className="sim-panel-header"><div><h2>Signal decisions</h2><p>Recorded in `simulation_action` with the queue values used by the controller.</p></div></div>
          <div className="sim-actions">{pair.actions?.length ? (pair.actions as Row[]).slice(-8).reverse().map((action, index) =>
            <div className="sim-action" key={`${action.control_mode}-${action.sim_second}-${index}`}><span className="sim-action-time">{action.sim_second}s</span>
              <div><b>{action.from_phase} → {action.to_phase}</b><small>{action.control_mode} · {action.reason}</small></div></div>) :
            <p className="sim-muted">Decisions will appear when the first signal phase changes.</p>}</div>
        </section>
        <section className="sim-panel"><div className="sim-panel-header"><div><h2>Fixed versus adaptive</h2><p>Database results for this comparison group</p></div><GitCompareArrows size={18} /></div>
          {pair.comparison ? <Comparison result={pair.comparison} /> : <div className="sim-compare-wait"><Activity size={23} />
            <p>{runs.every(run => terminal(run.status)) ? "Both runs must complete to produce a valid comparison." : "The comparison appears after both runs finish."}</p><small>Current status: fixed {fixed?.status}; adaptive {adaptive?.status}.</small></div>}
        </section>
      </div>
    </>}
  </div>;
}

function SimMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="sim-metric"><small>{label}</small><b>{value}</b><span>{hint}</span></div>;
}

function Junction({ snapshot }: { snapshot?: Row }) {
  const phase = snapshot?.active_phase || "NS";
  const signal = snapshot?.signal_state || "all_red";
  const vehicles: Row[] = snapshot?.vehicle_state?.vehicles || [];
  const light = (group: string) => signal === "all_red" || phase !== group ? "red" : signal;
  return <div className="sim-junction" aria-label={`Junction: north-south ${light("NS")}, east-west ${light("EW")}`}>
    <div className="sim-road-vertical" /><div className="sim-road-horizontal" />
    <div className="sim-road-centre" />
    <div className="sim-centre-line vertical" /><div className="sim-centre-line horizontal" />
    {["N", "S", "E", "W"].map(lane => <span key={lane} className={`sim-compass ${lane.toLowerCase()}`}>{lane}</span>)}
    <div className={`sim-light ns ${light("NS")}`} title={`North–south ${light("NS")}`} />
    <div className={`sim-light ew ${light("EW")}`} title={`East–west ${light("EW")}`} />
    {vehicles.map(vehicle => {
      const position = vehiclePosition(vehicle);
      return <div className={`sim-vehicle ${vehicle.state} ${vehicle.lane.toLowerCase()}`} key={vehicle.id}
        style={{ left: `${position.x}%`, top: `${position.y}%` }} title={`${vehicle.lane} ${vehicle.state}`} />;
    })}
  </div>;
}

function vehiclePosition(vehicle: Row) {
  if (vehicle.state === "crossing") {
    const progress = Math.min(1, Math.max(0, Number(vehicle.position)));
    if (vehicle.lane === "N") return { x: 47, y: 38 + progress * 28 };
    if (vehicle.lane === "S") return { x: 53, y: 62 - progress * 28 };
    if (vehicle.lane === "E") return { x: 62 - progress * 28, y: 47 };
    return { x: 38 + progress * 28, y: 53 };
  }
  const index = Number(vehicle.position);
  if (vehicle.lane === "N") return { x: 47, y: 32 - index * 6 };
  if (vehicle.lane === "S") return { x: 53, y: 68 + index * 6 };
  if (vehicle.lane === "E") return { x: 68 + index * 6, y: 47 };
  return { x: 32 - index * 6, y: 53 };
}

function Comparison({ result }: { result: Row }) {
  const fixed = result.fixed || {}, adaptive = result.adaptive || {};
  const difference = Number(result.wait_change_percent || 0);
  return <div className="sim-comparison">
    <div className={`sim-comparison-lead ${result.demand_equal && difference <= 0 ? "improved" : "worse"}`}>
      <strong>{!result.demand_equal ? "Demand mismatch: comparison invalid" : difference < 0 ? `${format(Math.abs(difference), 1)}% lower wait` : difference > 0 ? `${format(difference, 1)}% higher wait` : "Equal wait"}</strong>
      <span>Adaptive versus fixed in this simulation</span>
    </div>
    <table><thead><tr><th>METRIC</th><th>FIXED</th><th>ADAPTIVE</th></tr></thead><tbody>
      <tr><td>Average experienced wait</td><td>{format(fixed.average_wait_seconds, 2)}s</td><td>{format(adaptive.average_wait_seconds, 2)}s</td></tr>
      <tr><td>Vehicles served</td><td>{format(fixed.total_served)}</td><td>{format(adaptive.total_served)}</td></tr>
      <tr><td>Average queue</td><td>{format(fixed.average_queue, 2)}</td><td>{format(adaptive.average_queue, 2)}</td></tr>
      <tr><td>Largest queue</td><td>{format(fixed.max_queue)}</td><td>{format(adaptive.max_queue)}</td></tr>
      <tr><td>Same generated arrivals</td><td colSpan={2}>{result.demand_equal ? "Verified by seed, fingerprint and arrived count" : "Mismatch — do not compare"}</td></tr>
    </tbody></table>
    <p>{result.method}</p>
  </div>;
}
