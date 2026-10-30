import { ChevronRight, Database } from "lucide-react";
import { fmt, type Dict } from "../api";
import { Panel } from "../ui";

const LIMITS: [string, string][] = [
  ["Historical aggregates", "Rows are source-reported readings, not individual vehicles. Volume is a source aggregate and average speed is the arithmetic mean of readings."],
  ["Categorical time", "The CSV provides Morning, Daytime, Noon, Evening, Night and Midnight labels, not exact timestamps. Hour-level filtering is not supported."],
  ["Location coverage", "Area and road names exist; coordinates and road geometry do not, so nothing here is a geographic map. Sensor codes are logical labels created from each source location."],
  ["Entity coverage", "Individual vehicles and trips cannot be identified from these aggregate rows. The vehicle and trip tables are empty schema extensions."],
  ["Simulation", "The Live simulation page uses generated demand stored in separate tables. It is never mixed into these observations and is not real traffic."],
];

/** The one place the project explains what the data is and is not. */
export function Provenance({ boot }: { boot: Dict }) {
  const s = boot.source || {};
  const q = s.quality_report || {};
  const details: [string, any][] = [
    ["Original file", s.source_file],
    ["SHA-256", s.source_sha256],
    ["Date range", `${s.min_date ?? "—"} → ${s.max_date ?? "—"}`],
    ["Import", `#${s.import_id} · v${s.source_version}`],
    ["Source rows", fmt(s.input_rows)],
    ["Accepted rows", fmt(s.accepted_rows)],
    ["Rejected rows", fmt(s.rejected_rows)],
    ["Exact duplicate rows", fmt(q.duplicate_rows)],
    ["Areas · roads", `${fmt(boot.areas?.length)} · ${fmt(boot.roads?.length)}`],
    ["Observed time blocks", (q.time_blocks || []).join(", ")],
    ["Publisher license", q.provenance || "Not stated in dataset listing"],
    ["Measurement units", s.units || "Not documented"],
  ];
  return (
    <>
      <div className="source-hero">
        <div className="source-mark"><Database size={24} /></div>
        <div>
          <div className="eyebrow">ACTIVE DATASET IMPORT</div>
          <h2>Bangalore Traffic 2023–2024</h2>
          <p>Historical Kaggle CSV imported into the local MySQL database.</p>
        </div>
        <a className="btn quiet" href={s.url} target="_blank" rel="noreferrer">View source <ChevronRight size={15} /></a>
      </div>

      <Panel title="Import and validation" sub="Captured during the transactional CSV import">
        <div className="provenance-grid">
          {details.map(([k, v]) => <div key={k}><span>{k}</span><b>{String(v ?? "—")}</b></div>)}
        </div>
      </Panel>

      <Panel title="Source fields" sub="All original CSV fields are preserved in each observation's JSON source_data column">
        <div className="field-tags">{(q.columns || []).map((c: string) => <span key={c}>{c}</span>)}</div>
      </Panel>

      <Panel title="What this data is not">
        <div className="limits-list">
          {LIMITS.map(([title, text]) => <div key={title}><b>{title}</b><span>{text}</span></div>)}
        </div>
      </Panel>
    </>
  );
}
