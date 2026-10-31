import { Activity, Database, Gauge, Map } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { deriveInsights } from "@/lib/traffic/insights.mjs";
import { OverviewSimulationCard } from "@/components/simulation/overview-simulation-card";
import { fmt, pct, type Dict } from "../api";
import { ChartFrame, Empty, GridTable, Metric, Panel } from "../ui";

const CONGESTION_COLORS = ["#39a681", "#e0a43a", "#db625e"];
const CONGESTION_COLOR_MAP: Record<string, string> = {
  Low: "#39a681",
  Medium: "#e0a43a",
  High: "#db625e",
};

function formatVolumeAxis(v: number) {
  if (v >= 1_000_000) return `${Number((v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1))}M`;
  if (v >= 1_000) return `${Number((v / 1_000).toFixed(0))}k`;
  return String(v);
}

export function Overview({ data, openSimulation }: { data: Dict; openSimulation: (group?: string) => void }) {
  const k = data.kpis || {};
  const insights = deriveInsights(data);
  const congestion = (data.congestion || []).map((r: any, i: number) => ({
    ...r,
    readings: Number(r.readings) || 0,
    fill: CONGESTION_COLOR_MAP[r.congestion_level] || CONGESTION_COLORS[i % 3],
  }));
  return (
    <>
      <div className="metric-grid">
        <Metric icon={Database} label="Source observations" value={fmt(k.readings)} hint="Rows matching current filters" />
        <Metric icon={Activity} label="Recorded traffic volume" value={fmt(k.recorded_volume)} hint="Sum of source-reported volume, not unique vehicles" tone="teal" />
        <Metric icon={Map} label="Road locations" value={fmt(k.roads)} hint={`${fmt(k.areas)} areas`} tone="purple" />
        <Metric icon={Gauge} label="Average reported speed" value={fmt(k.average_speed, 1)} hint="Source unit not documented" tone="amber" />
      </div>

      {insights.length > 0 && (
        <div className="insight-grid">
          {insights.map(card => (
            <div className={`insight ${card.tone || ""}`} key={card.key}>
              <small>{card.label}</small>
              <b>{card.title}</b>
              <span>{card.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="chart-grid">
        <Panel title="Recorded volume over time" sub="Daily sum of source observations">
          <ChartFrame>
            {data.daily?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily}>
                  <defs>
                    <linearGradient id="volfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3979c6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3979c6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#edf1f6" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={s => String(s).slice(5)} minTickGap={35} />
                  <YAxis tickFormatter={s => `${fmt(s / 1000)}k`} width={48} />
                  <Tooltip formatter={(v: any) => fmt(v)} labelFormatter={s => `Date ${s}`} />
                  <Area type="monotone" dataKey="recorded_volume" name="Reported volume" stroke="#3979c6" strokeWidth={2} fill="url(#volfill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </ChartFrame>
        </Panel>

        <Panel title="Traffic by time block" sub="Source categories; no hourly timestamps inferred">
          <ChartFrame>
            {data.timeBlocks?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.timeBlocks} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#edf1f6" vertical={false} />
                  <XAxis dataKey="time_block" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatVolumeAxis} width={52} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmt(v)} />
                  <Bar dataKey="recorded_volume" name="Reported volume" fill="#4786cf" radius={[5, 5, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </ChartFrame>
        </Panel>
      </div>

      <div className="split-grid">
        <Panel title="Top roads by reported volume">
          <GridTable
            rows={(data.roads || []).slice(0, 7)}
            columns={[
              ["road_name", "ROAD", r => <><b>{r.road_name}</b><small className="subcell">{r.area}</small></>],
              ["recorded_volume", "VOLUME", r => fmt(r.recorded_volume)],
              ["average_speed", "AVG SPEED", r => fmt(r.average_speed, 1)],
              ["high_percent", "HIGH", r => <span className="pill-red">{pct(r.high_percent)}</span>],
            ]}
          />
        </Panel>

        <Panel title="Congestion mix" sub="Share of matching readings">
          <div className="pie-wrap">
            <ChartFrame>
              {congestion.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={congestion} dataKey="readings" nameKey="congestion_level" innerRadius={53} outerRadius={79} paddingAngle={3}>
                      {congestion.map((entry: any, i: number) => (
                        <Cell key={entry.congestion_level || i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </ChartFrame>
            <div className="legend-list">
              {congestion.map((r: Dict) => (
                <div key={r.congestion_level}>
                  <i style={{ background: r.fill }} />
                  <span>{r.congestion_level}</span>
                  <b>{pct((100 * r.readings) / Math.max(1, Number(k.readings) || 1))}</b>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <OverviewSimulationCard openSimulation={openSimulation} />
    </>
  );
}
