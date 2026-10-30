import { useState, type ReactNode } from "react";
import { BookOpen, Download, LoaderCircle, Play, Search } from "lucide-react";
import { SqlBlock } from "@/components/shared/sql-block";
import { MAX_CUSTOM_MS, MAX_CUSTOM_ROWS } from "@/lib/traffic/sql-guard.mjs";
import { filterParams, fmt, postApi, type Dict, type Filters } from "../api";
import { ErrorCard, GridTable, Panel, Stamp, Tabs, autoColumns } from "../ui";

const TABS = [
  { id: "saved", label: "Saved exercises" },
  { id: "own", label: "Write your own" },
];

type Props = { filters: Filters; queries: Dict[]; filterBar: ReactNode };

/** Mount with a `key` of the applied filters so saved-exercise results reset when they change. */
export function SqlLab({ filters, queries, filterBar }: Props) {
  const [tab, setTab] = useState("saved");
  return (
    <>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "saved" && <>{filterBar}<SavedQueries filters={filters} queries={queries} /></>}
      {tab === "own" && <Editor />}
    </>
  );
}

function SavedQueries({ filters, queries }: { filters: Filters; queries: Dict[] }) {
  const [id, setId] = useState(queries[0]?.id ?? "");
  const [result, setResult] = useState<Dict | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError("");
    try { setResult(await postApi({ action: "query", id, filters })); }
    catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  }

  const csv = filterParams(filters);
  csv.set("action", "query");
  csv.set("id", id);
  csv.set("format", "csv");

  return (
    <>
      <div className="query-picker">
        <label>SQL exercise
          <select value={id} onChange={e => { setId(e.target.value); setResult(null); }}>
            {queries.map(q => <option key={q.id} value={q.id}>{q.title} · {q.category}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={() => void run()} disabled={running}>
          {running ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Run query
        </button>
        <a className="btn quiet" href={`/api/traffic?${csv}`}><Download size={15} /> Download CSV</a>
      </div>
      <div className="query-hint">
        <BookOpen size={15} />
        <span>Read-only prepared query over the active import and the filters above. Parameter values are passed separately from the SQL, and CSV export is formula-safe.</span>
      </div>

      {error && <ErrorCard message={error} />}
      {result && (
        <>
          <div className="result-meta">
            <Stamp>{result.row_count} rows</Stamp>
            <Stamp>{fmt(result.round_trip_ms, 3)} ms driver round trip</Stamp>
            <Stamp>Import #{result.import_id}</Stamp>
          </div>
          <Panel title={result.title} sub={result.why}>
            <div className="feature-row">{result.features?.map((f: string) => <span className="feature" key={f}>{f}</span>)}</div>
            <div className="sql-wrap"><SqlBlock sql={result.sql} /></div>
            <div className="params"><b>Bound parameters</b><code>{JSON.stringify(result.parameters)}</code></div>
            <GridTable rows={result.rows || []} columns={autoColumns(result.columns || [])} />
            <p className="result-foot">Timing is measured around the database-driver request and row retrieval. It is not server CPU time.</p>
          </Panel>
        </>
      )}
    </>
  );
}

const STARTER = `SELECT road_name,
       COUNT(*) AS readings,
       ROUND(AVG(average_speed), 1) AS avg_speed
FROM v_traffic_observation
WHERE import_id = (SELECT active_import_id FROM app_state WHERE singleton_id = 1)
GROUP BY road_name
ORDER BY readings DESC`;

function Editor() {
  const [sql, setSql] = useState(STARTER);
  const [result, setResult] = useState<Dict | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError("");
    try { setResult(await postApi({ action: "sql", sql })); }
    catch (e) { setResult(null); setError((e as Error).message); }
    finally { setRunning(false); }
  }

  return (
    <>
      <div className="query-hint">
        <BookOpen size={15} />
        <span>
          One <code>SELECT</code> or <code>WITH</code> query, no comments or <code>INTO</code>, project database only. It runs in a read-only transaction,
          stops after {MAX_CUSTOM_MS / 1000} s and shows at most {MAX_CUSTOM_ROWS} rows. Give duplicate column names distinct aliases. Table and column names are on the Schema page;
          the global filters do not apply here.
        </span>
      </div>
      <div className="editor">
        <textarea
          aria-label="SQL query"
          spellCheck={false}
          rows={9}
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void run(); } }}
        />
        <div className="editor-actions">
          <button className="btn primary" onClick={() => void run()} disabled={running || !sql.trim()}>
            {running ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />} Run query
          </button>
          <span>Ctrl + Enter</span>
        </div>
      </div>

      {error && <ErrorCard message={error} />}
      {result && (
        <>
          <div className="result-meta">
            <Stamp>{result.row_count} rows{result.truncated ? ` (limited to ${result.limit})` : ""}</Stamp>
            <Stamp>{fmt(result.round_trip_ms, 3)} ms driver round trip</Stamp>
          </div>
          <Panel title="Result">
            <GridTable rows={result.rows || []} columns={autoColumns(result.columns || [])} />
          </Panel>
        </>
      )}
    </>
  );
}
