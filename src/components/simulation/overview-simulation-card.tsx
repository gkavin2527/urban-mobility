"use client";

import { useEffect, useState } from "react";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { scenarioLabel } from "@/lib/simulation/scenarios.mjs";

type Latest = {
  comparison_group: string;
  scenario: string;
  demand_equal: boolean;
  wait_change_percent: number | null;
  fixed: { average_wait_seconds: number };
  adaptive: { average_wait_seconds: number };
};

const digits = (value: number, d = 1) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: d });

function summary(latest: Latest) {
  const change = latest.wait_change_percent;
  if (!latest.demand_equal) return "demand mismatch between the two runs";
  if (change === null || change === undefined) return "no baseline to compare";
  const verdict = change <= 0 ? "less" : "more";
  return `adaptive timing waits ${digits(Math.abs(change))}% ${verdict} than fixed (${digits(latest.adaptive.average_wait_seconds)}s vs ${digits(latest.fixed.average_wait_seconds)}s per vehicle)`;
}

/** One-line pointer to the latest saved comparison; the full story lives on the Live simulation page. */
export function OverviewSimulationCard({ openSimulation }: { openSimulation: (group?: string) => void }) {
  const [state, setState] = useState<{ latest: Latest | null; error?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/simulation?action=overview", { cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Simulation summary is unavailable");
        if (alive) setState({ latest: body.latest_comparison });
      })
      .catch(cause => { if (alive) setState({ latest: null, error: (cause as Error).message }); });
    return () => { alive = false; };
  }, []);

  const latest = state?.latest;
  const text = !state ? "Checking saved comparisons…"
    : state.error ? `Simulation summary unavailable: ${state.error}`
    : !latest ? "No completed comparison yet. Run both controllers to record one."
    : `${scenarioLabel(latest.scenario)}: ${summary(latest)}`;

  return (
    <section className="sim-strip" aria-label="Latest synthetic simulation comparison">
      <GitCompareArrows size={16} />
      <span><b>Synthetic experiment</b> · {text}</span>
      <button onClick={() => openSimulation(latest?.comparison_group)}>Open simulation <ArrowRight size={14} /></button>
    </section>
  );
}
