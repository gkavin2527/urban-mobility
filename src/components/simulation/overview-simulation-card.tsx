"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, GitCompareArrows, LoaderCircle } from "lucide-react";

type Run = {
  total_arrived: number;
  total_served: number;
  average_wait_seconds: number;
  max_queue: number;
};

type LatestComparison = {
  comparison_group: string;
  scenario: string;
  demand_equal: boolean;
  wait_change_percent: number | null;
  fixed: Run;
  adaptive: Run;
};

type Overview = { latest_comparison: LatestComparison | null };

const number = (value: number, digits = 0) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

export function OverviewSimulationCard({ openSimulation }: { openSimulation: (group?: string) => void }) {
  const [latest, setLatest] = useState<LatestComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/simulation?action=overview", { cache: "no-store" })
      .then(async response => {
        const body: Overview & { error?: string } = await response.json();
        if (!response.ok) throw new Error(body.error || "Simulation summary is unavailable");
        return body;
      })
      .then(body => { if (alive) setLatest(body.latest_comparison); })
      .catch(cause => { if (alive) setError((cause as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const wait = latest?.wait_change_percent;
  return <section className="sim-overview-card" aria-label="Latest synthetic simulation comparison">
    <div className="sim-overview-head"><span className="sim-overview-icon"><GitCompareArrows size={18} /></span>
      <div><span className="sim-overview-label">SEPARATE SYNTHETIC EXPERIMENT</span><h2>Fixed versus adaptive signal control</h2>
        <p>Generated junction traffic is stored apart from historical Kaggle observations.</p></div>
      <button className="sim-overview-open" onClick={() => openSimulation(latest?.comparison_group)}>
        Open simulation <ArrowRight size={15} />
      </button>
    </div>
    {loading ? <p className="sim-overview-state"><LoaderCircle className="spin" size={15} /> Checking saved comparisons…</p> :
      error ? <p className="sim-overview-state">Simulation summary unavailable: {error}</p> :
      !latest ? <p className="sim-overview-state"><Activity size={15} /> No completed comparison yet. Run both controllers to record results in MySQL.</p> :
      <div className="sim-overview-results">
        <div><small>SCENARIO</small><strong>{latest.scenario.replaceAll("_", " ")}</strong></div>
        <div><small>FIXED WAIT / ARRIVAL</small><strong>{number(latest.fixed.average_wait_seconds, 2)}s</strong></div>
        <div><small>ADAPTIVE WAIT / ARRIVAL</small><strong>{number(latest.adaptive.average_wait_seconds, 2)}s</strong></div>
        <div><small>ADAPTIVE DIFFERENCE</small><strong className={wait !== null && wait <= 0 ? "sim-good" : "sim-worse"}>
          {!latest.demand_equal ? "Demand mismatch" : wait === null ? "No baseline" : `${wait > 0 ? "+" : ""}${number(wait, 2)}%`}
        </strong></div>
        <div><small>SERVED: FIXED → ADAPTIVE</small><strong>{number(latest.fixed.total_served)} → {number(latest.adaptive.total_served)}</strong></div>
      </div>}
  </section>;
}
