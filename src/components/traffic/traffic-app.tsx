"use client";

import { useMemo, useState } from "react";
import { Activity, BarChart3, Cable, ChevronRight, CircleHelp, Database, Gauge, LayoutDashboard, LoaderCircle, Menu, RefreshCw, Search, TrafficCone, X, type LucideIcon } from "lucide-react";
import { SimulationLab } from "@/components/simulation/simulation-lab";
import { EMPTY, useApi, type Filters } from "./api";
import { FilterBar } from "./filter-bar";
import { Explore } from "./pages/explore";
import { Overview } from "./pages/overview";
import { Performance } from "./pages/performance";
import { Provenance } from "./pages/provenance";
import { Schema } from "./pages/schema";
import { SqlLab } from "./pages/sql-lab";
import { Loading } from "./ui";

type NavItem = { id: string; label: string; icon: LucideIcon; group: string; subtitle: string; filters?: boolean };

const NAV: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "ANALYZE", filters: true, subtitle: "Headline numbers, notable roads and trends in the imported traffic readings." },
  { id: "explore", label: "Explore", icon: BarChart3, group: "ANALYZE", filters: true, subtitle: "Time, weather, roads, areas and operational measures in one place." },
  { id: "simulation", label: "Live simulation", icon: TrafficCone, group: "ANALYZE", subtitle: "Fixed and adaptive signal control on the same synthetic traffic demand." },
  { id: "schema", label: "Schema", icon: Database, group: "DATABASE", subtitle: "Tables, columns, keys and live row counts in the configured MySQL database." },
  { id: "sqllab", label: "SQL lab", icon: Search, group: "DATABASE", subtitle: "Curated advanced SQL with CSV export, or write your own read-only query." },
  { id: "performance", label: "Performance", icon: Gauge, group: "DATABASE", subtitle: "Real MySQL index plans, plus the views and refreshable summary table." },
  { id: "provenance", label: "Data & provenance", icon: Cable, group: "PROJECT", subtitle: "Where the data came from, how it was validated, and what it cannot tell you." },
];
const GROUPS = ["ANALYZE", "DATABASE", "PROJECT"];
const NEEDS_ANALYTICS = ["overview", "explore"];

export function TrafficApp() {
  const [page, setPage] = useState("overview");
  const [simulationGroup, setSimulationGroup] = useState("");
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);

  const boot = useApi("bootstrap");
  const nav = useMemo(() => NAV.find(n => n.id === page)!, [page]);
  const analytics = useApi("analytics", applied, !!boot.data && NEEDS_ANALYTICS.includes(page));

  if (boot.error && !boot.data) {
    return (
      <div className="setup-screen"><div className="setup-card">
        <div className="setup-icon"><Database /></div>
        <div className="eyebrow">LOCAL MYSQL CONNECTION</div>
        <h1>Connect your traffic database</h1>
        <p>{boot.error}</p>
        <div className="setup-steps">
          <b>Finish the local setup</b>
          <code>npm run db:setup</code>
          <code>npm run data:import</code>
          <span>Use the same MySQL credentials as your Workbench connection.</span>
        </div>
        <button className="btn primary" onClick={boot.reload}><RefreshCw size={15} /> Retry connection</button>
      </div></div>
    );
  }
  if (!boot.data) return <div className="loading-screen"><LoaderCircle className="spin" /> Loading MySQL traffic workspace…</div>;

  const b = boot.data;
  const roads: Record<string, any>[] = b.roads || [];
  const areaRoads = roads.filter(r => !draft.area || r.area === draft.area);
  const change = (key: keyof Filters, value: string) => setDraft(old => ({ ...old, [key]: value, ...(key === "area" ? { road: "" } : {}) }));
  const go = (id: string) => { if (id === "simulation") setSimulationGroup(""); setPage(id); setMobile(false); };
  const filterBar = (
    <FilterBar draft={draft} set={change} boot={b} roads={areaRoads} busy={busy}
      apply={() => setApplied({ ...draft })} reset={() => { setDraft(EMPTY); setApplied(EMPTY); }} />
  );
  const filterKey = JSON.stringify(applied);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={21} /></div>
          <div><strong>ASQL</strong><span>URBAN MOBILITY LAB</span></div>
          <button className="mobile-close" onClick={() => setMobile(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        {GROUPS.map(group => (
          <div className="nav-group" key={group}>
            <div className="nav-label">{group}</div>
            {NAV.filter(n => n.group === group).map(item => (
              <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => go(item.id)}>
                <item.icon size={17} /><span>{item.label}</span>
                {page === item.id && <ChevronRight size={14} className="nav-arrow" />}
              </button>
            ))}
          </div>
        ))}
      </aside>
      {mobile && <button aria-label="Close navigation" className="scrim" onClick={() => setMobile(false)} />}

      <div className="main-shell">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobile(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Urban mobility</span><b>/</b><strong>{nav.label}</strong></div>
          <div className="top-status"><span><i />MySQL {b.database?.version}</span><span className="top-database"><Database size={14} />{b.database?.database_name}</span></div>
        </header>

        <main className="main-content"><div className="content-width">
          <div className="page-intro">
            <div><div className="eyebrow">{nav.group}</div><h1>{nav.label}</h1><p>{nav.subtitle}</p></div>
          </div>

          {nav.filters && filterBar}
          {NEEDS_ANALYTICS.includes(page) && analytics.error && (
            <div className="error-banner"><CircleHelp size={17} /><span>{analytics.error}</span><button onClick={analytics.reload}>Retry</button></div>
          )}
          {NEEDS_ANALYTICS.includes(page) && analytics.loading && <Loading>Querying the active dataset…</Loading>}

          {page === "overview" && analytics.data && <Overview data={analytics.data} openSimulation={group => { setSimulationGroup(group || ""); setPage("simulation"); }} />}
          {page === "explore" && analytics.data && <Explore data={analytics.data} boot={b} filters={applied} />}
          {page === "simulation" && <SimulationLab initialGroup={simulationGroup} />}
          {page === "schema" && <Schema />}
          {page === "sqllab" && <SqlLab key={filterKey} filters={applied} queries={b.queries || []} filterBar={filterBar} />}
          {page === "performance" && <Performance boot={b} filters={applied} roads={roads} filterBar={filterBar} setBusy={setBusy} />}
          {page === "provenance" && <Provenance boot={b} />}
        </div></main>
      </div>
    </div>
  );
}
