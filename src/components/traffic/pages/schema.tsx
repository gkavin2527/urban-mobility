import { Table2 } from "lucide-react";
import { fmt, useApi, type Dict } from "../api";
import { ErrorCard, GridTable, Loading, Panel } from "../ui";

export function Schema() {
  const { data, error, loading, reload } = useApi("schema");
  if (error) return <ErrorCard message={error} retry={reload} />;
  if (loading || !data) return <Loading>Reading INFORMATION_SCHEMA…</Loading>;
  return (
    <>
      <div className="schema-grid">
        {(data.tables || []).map((t: Dict) => (
          <div className="schema-card" key={t.table_name}>
            <div className="schema-title">
              <Table2 size={16} /><b>{t.table_name}</b>
              <span>{t.row_count === null ? "VIEW" : `${fmt(t.row_count)} rows`}</span>
            </div>
            <div className="schema-columns">
              {(t.columns || []).map((c: Dict) => (
                <div key={c.column_name}>
                  <span>{c.column_name}{c.column_key === "PRI" && <em> PK</em>}</span>
                  <code>{c.column_type}</code>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Panel title="Foreign key relationships" sub="Declared in the MySQL schema">
        <GridTable
          rows={data.relations || []}
          columns={[
            ["table_name", "TABLE", r => r.table_name],
            ["column_name", "COLUMN", r => r.column_name],
            ["referenced_table", "REFERENCES", r => <b>{r.referenced_table}.{r.referenced_column}</b>],
          ]}
        />
      </Panel>

      <Panel title="Source coverage boundaries">
        <p className="coverage-copy">The dataset does not supply identifiable vehicles or trips. Those tables exist as an extension point and contain no invented rows. Sensor identifiers are logical dataset locations only.</p>
        <div className="coverage-grid">
          {Object.entries(data.coverage || {}).map(([k, v]) => <div key={k}><span>{k}</span><b>{String(v)}</b></div>)}
        </div>
      </Panel>
    </>
  );
}
