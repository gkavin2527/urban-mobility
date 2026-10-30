import { useState } from "react";
import { BookOpen, Download, LoaderCircle, Search } from "lucide-react";
import { SqlBlock } from "@/components/shared/sql-block";
import { filterParams, fmt, postApi, type Dict, type Filters } from "../api";
import { ErrorCard, GridTable, Panel, Stamp, autoColumns } from "../ui";

/** Curated, parameterised SQL exercises. Mount with a `key` of the applied filters so results reset when they change. */
export function SqlLab({ filters, queries }: { filters: Filters; queries: Dict[] }) {
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
