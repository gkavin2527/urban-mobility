import { useEffect, useState } from "react";

export type Dict = Record<string, any>;
export type Filters = { area: string; road: string; start: string; end: string; timeBlock: string; congestion: string; weather: string; roadwork: string };
export const EMPTY: Filters = { area: "", road: "", start: "", end: "", timeBlock: "", congestion: "", weather: "", roadwork: "" };

export const fmt = (value: any, digits = 0) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
/** Like fmt, but shows a dash for missing values (an AVG over no rows is NULL, not zero). */
export const fmtOr = (value: any, digits = 0, suffix = "") => (value === null || value === undefined ? "—" : `${fmt(value, digits)}${suffix}`);
export const pct = (value: any) => `${fmt(value, 1)}%`;

export function filterParams(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

async function parse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export async function getApi(action: string, filters: Filters = EMPTY) {
  const params = filterParams(filters);
  params.set("action", action);
  return parse(await fetch(`/api/traffic?${params}`, { cache: "no-store" }));
}

export async function postApi(body: Dict) {
  return parse(await fetch("/api/traffic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }));
}

/**
 * Loads one API action whenever its filters change. State is only set after the request settles
 * (never synchronously in the effect), and results are tagged with the request key so a stale
 * answer is never shown for newer filters.
 */
export function useApi(action: string, filters: Filters = EMPTY, enabled = true) {
  const key = JSON.stringify([action, filters]);
  const [state, setState] = useState<{ key: string; data?: Dict; error?: string }>({ key: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    getApi(action, filters)
      .then(data => { if (live) setState({ key, data }); })
      .catch(error => { if (live) setState({ key, error: (error as Error).message }); });
    return () => { live = false; };
  }, [key, enabled, attempt]);

  const current = state.key === key ? state : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: enabled && !current,
    reload: () => setAttempt(n => n + 1),
    setData: (data: Dict) => setState({ key, data }),
  };
}
