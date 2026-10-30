import type { ReactNode } from "react";
import { CircleHelp, LoaderCircle, type LucideIcon } from "lucide-react";
import type { Dict } from "./api";

export function Panel({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children = "No rows match the selected filters." }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export type Column = [key: string, label: string, render: (row: Dict) => ReactNode];

export function GridTable({ rows, columns }: { rows: Dict[]; columns: Column[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.length
            ? rows.map((row, i) => <tr key={i}>{columns.map(([key, , render]) => <td key={key}>{render(row)}</td>)}</tr>)
            : <tr><td colSpan={columns.length} className="empty-cell">No rows match the selected filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** Table columns for an arbitrary result set (used by the SQL lab). */
export function autoColumns(columns: string[], digits = 2): Column[] {
  const cell = (value: any) =>
    typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
    : value !== null && typeof value === "object" ? JSON.stringify(value)
    : String(value ?? "—");
  return columns.map(c => [c, c.replaceAll("_", " ").toUpperCase(), (r: Dict) => cell(r[c])]);
}

export function Metric({ label, value, hint, icon: Icon, tone = "blue" }: { label: string; value: string; hint: string; icon: LucideIcon; tone?: string }) {
  return (
    <div className="metric">
      <span className={`metric-icon ${tone}`}><Icon size={18} /></span>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-hint">{hint}</div>
    </div>
  );
}

export function ChartFrame({ children }: { children: ReactNode }) {
  return <div className="chart-frame">{children}</div>;
}

export function Stamp({ children }: { children: ReactNode }) {
  return <span className="stamp">{children}</span>;
}

export function ErrorCard({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-banner">
      <CircleHelp size={17} /><span>{message}</span>
      {retry && <button onClick={retry}>Retry</button>}
    </div>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return <div className="loading-inline"><LoaderCircle className="spin" /> {children}</div>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className="tab" onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}
