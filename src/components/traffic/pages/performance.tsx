import { useState, type ReactNode } from "react";
import { Activity, Gauge, LoaderCircle, RefreshCw, Search, Table2 } from "lucide-react";
import { fmt, postApi, useApi, type Dict, type Filters } from "../api";
import { ErrorCard, GridTable, Loading, Metric, Panel, Tabs } from "../ui";

const TABS = [
  { id: "benchmark", label: "Index benchmark" },
  { id: "views", label: "Views & summaries" },
];

type Props = { boot: Dict; filters: Filters; roads: Dict[]; filterBar: ReactNode; setBusy: (busy: boolean) => void };

export function Performance({ boot, filters, roads, filterBar, setBusy }: Props) {
  const [tab, setTab] = useState("benchmark");
  return (
    <>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "benchmark" && <>{filterBar}<Benchmark boot={boot} filters={filters} roads={roads} setBusy={setBusy} /></>}
      {tab === "views" && <Views />}
    </>
  );
}

function Benchmark({ boot, filters, roads, setBusy }: Omit<Props, "filterBar">) {
  const [result, setResult] = useState<Dict | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true); setBusy(true); setError(""); setResult(null);
    try { setResult(await postApi({ action: "benchmark", filters })); }
    catch (e) { setError((e as Error).message); }
    finally { setRunning(false); setBusy(false); }
  }

  const target = filters.road ? roads.find(r => String(r.road_id) === filters.road)?.road_name || "Selected road" : "First road in the active dataset";
  return (
    <>
      <div className="benchmark-controls">
        <div>
          <b>Benchmark target</b>
          <p>{target} · {boot.source?.min_date} to {boot.source?.max_date}. Compares identical rows under MySQL <b>IGNORE INDEX</b> and <b>FORCE INDEX</b>; it changes no schema, and the index is not guaranteed to win.</p>
        </div>
        <button className="btn primary" onClick={() => void run()} disabled={running}>
          {running ? <><LoaderCircle className="spin" size={15} /> Measuring plans…</> : <><Gauge size={15} /> Run database benchmark</>}
        </button>
      </div>

      {error && <ErrorCard message={error} />}
      {result && (
        <>
          <div className="metric-grid compact">
            <Metric icon={Search} label="Without index median" value={`${fmt(result.without.median_ms, 3)} ms`} hint={`${fmt(result.without.row_count)} rows · 3 warmed runs`} />
            <Metric icon={Gauge} label="With index median" value={`${fmt(result.withIndex.median_ms, 3)} ms`} hint={`${fmt(result.withIndex.row_count)} rows · 3 warmed runs`} tone="teal" />
            <Metric icon={Activity} label="Result equality" value={result.equivalent ? "Verified" : "Mismatch"} hint={result.equivalent ? "Row checksums match" : "Investigate before presenting"} tone={result.equivalent ? "teal" : "red"} />
          </div>
          <div className="chart-grid">
            <PlanPanel title="Without index" data={result.without} />
            <PlanPanel title="With sensor/date index" data={result.withIndex} />
          </div>
          <p className="muted-note">{result.measurement}</p>
        </>
      )}
    </>
  );
}

function PlanPanel({ title, data }: { title: string; data: Dict }) {
  return (
    <Panel title={title} sub={`Median ${fmt(data.median_ms, 3)} ms · results ${data.checksum?.slice(0, 16)}…`}>
      <pre className="plan-tree">{typeof data.actual_plan === "string" ? data.actual_plan : JSON.stringify(data.actual_plan, null, 2)}</pre>
      <details className="plan-details">
        <summary>EXPLAIN FORMAT=JSON</summary>
        <pre className="plan-json">{JSON.stringify(data.plan, null, 2)}</pre>
      </details>
    </Panel>
  );
}

function Views() {
  const { data, error, loading, reload, setData } = useApi("views");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function rebuild() {
    setBusy(true); setMessage("");
    try {
      const next = await postApi({ action: "refresh" });
      setData(next);
      setMessage(next.matches ? "Summary refreshed; the view and the stored summary match." : "Summary refreshed; review the comparison.");
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }

  if (error) return <ErrorCard message={error} retry={reload} />;
  if (loading || !data) return <Loading>Reading views and summary…</Loading>;
  return (
    <>
      <div className="benchmark-controls">
        <div>
          <b>Summary consistency check</b>
          <p>MySQL has no native materialized view, so a refreshable summary table stands in for one. This recomputes the ordinary view and compares it with the stored table.</p>
          <p className="muted-note">{data.scope}</p>
        </div>
        <button className="btn primary" onClick={() => void rebuild()} disabled={busy}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Refresh summary
        </button>
      </div>
      <div className="summary-status">
        <span className={data.matches ? "status-ok" : "status-warn"}>{data.matches ? "MATCH" : "NOT REFRESHED / DIFFERENT"}</span>
        <span>Last refresh: {data.refreshed_at || "Not yet refreshed"}</span>
        {message && <span>{message}</span>}
      </div>
      <Panel title="Per-road aggregate comparison" sub="Weighted average speed preserves row weighting">
        <GridTable
          rows={data.ordinary || []}
          columns={[
            ["road_name", "ROAD", r => <b>{r.road_name}</b>],
            ["dates", "DATES", r => fmt(r.dates)],
            ["recorded_volume", "REPORTED VOLUME", r => fmt(r.recorded_volume)],
            ["average_speed", "AVERAGE SPEED", r => fmt(r.average_speed, 2)],
          ]}
        />
      </Panel>
      <Panel title="Database view definitions" sub="Three ordinary views">
        <div className="definition-list">
          {(data.definitions || []).map((v: Dict) => (
            <details key={v.name}><summary><Table2 size={13} /> {v.name}</summary><pre>{v.definition}</pre></details>
          ))}
        </div>
      </Panel>
    </>
  );
}
