import type { Dict, Filters } from "./api";
import { Stamp } from "./ui";

type Props = {
  draft: Filters;
  set: (key: keyof Filters, value: string) => void;
  boot: Dict;
  roads: Dict[];
  apply: () => void;
  reset: () => void;
  busy: boolean;
};

function Select({ label, value, onChange, all, options }: { label: string; value: string; onChange: (v: string) => void; all: string; options: { value: string; label: string }[] }) {
  return (
    <label>{label}
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const plain = (values: string[]) => values.map(v => ({ value: v, label: v }));

export function FilterBar({ draft, set, boot, roads, apply, reset, busy }: Props) {
  const { min_date: min, max_date: max } = boot.source || {};
  return (
    <div className="filterbar">
      <div className="filter-heading">
        <strong>Analysis scope</strong>
        <Stamp>{min} — {max}</Stamp>
      </div>
      <div className="filter-controls">
        <Select label="Area" value={draft.area} onChange={v => set("area", v)} all="All areas" options={plain(boot.areas)} />
        <Select label="Road" value={draft.road} onChange={v => set("road", v)} all="All roads" options={roads.map(r => ({ value: String(r.road_id), label: r.road_name }))} />
        <label>From<input type="date" min={min} max={draft.end || max} value={draft.start} onChange={e => set("start", e.target.value)} /></label>
        <label>To<input type="date" min={draft.start || min} max={max} value={draft.end} onChange={e => set("end", e.target.value)} /></label>
        <Select label="Time block" value={draft.timeBlock} onChange={v => set("timeBlock", v)} all="All blocks" options={plain(boot.timeBlocks)} />
        <Select label="Congestion" value={draft.congestion} onChange={v => set("congestion", v)} all="All levels" options={plain(["Low", "Medium", "High"])} />
        <Select label="Weather" value={draft.weather} onChange={v => set("weather", v)} all="All weather" options={plain(boot.weather)} />
        <Select label="Roadwork" value={draft.roadwork} onChange={v => set("roadwork", v)} all="Any" options={plain(["Yes", "No"])} />
        <div className="filter-actions">
          <button className="btn primary" onClick={apply} disabled={busy}>Apply</button>
          <button className="btn quiet" onClick={reset}>Reset</button>
        </div>
      </div>
    </div>
  );
}
