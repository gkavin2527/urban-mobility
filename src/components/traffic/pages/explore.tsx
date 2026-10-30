import { useState } from "react";
import { Activity, Gauge, Map, Server, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pivotHeatmap } from "@/lib/traffic/insights.mjs";
import { fmt, fmtOr, useApi, type Dict, type Filters } from "../api";
import { ChartFrame, Empty, ErrorCard, GridTable, Loading, Metric, Panel, Tabs } from "../ui";

const TABS = [
  { id: "patterns", label: "Time & weather" },
  { id: "roads", label: "Roads & areas" },
  { id: "operations", label: "Operations" },
  { id: "rows", label: "Latest rows" },
];

export function Explore({ data, boot, filters }: { data: Dict; boot: Dict; filters: Filters }) {
  const [tab, setTab] = useState("patterns");
  return (
    <>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "patterns" && <Patterns data={data} />}
      {tab === "roads" && <RoadsAndAreas data={data} areas={boot.areas || []} />}
      {tab === "operations" && <Operations filters={filters} />}
      {tab === "rows" && <LatestRows rows={data.observations || []} />}
    </>
  );
}

function Patterns({ data }: { data: Dict }) {
  return (
    <div className="chart-grid">
      <Panel title="Reported speed by time block" sub="Arithmetic mean across source rows, with reading count">
        <ChartFrame>
          {data.timeBlocks?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.timeBlocks}>
                <CartesianGrid stroke="#edf1f6" vertical={false} />
                <XAxis dataKey="time_block" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="average_speed" name="Average speed" fill="#bfd6ef" radius={[5, 5, 0, 0]} />
                <Line dataKey="readings" name="Readings" stroke="#3778c2" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartFrame>
      </Panel>
      <Panel title="Weather and reported speed" sub="Descriptive comparison, not causal evidence">
        <ChartFrame>
          {data.weather?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weather}>
                <CartesianGrid stroke="#edf1f6" vertical={false} />
                <XAxis dataKey="weather" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="average_speed" name="Average speed" fill="#4f8dcc" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartFrame>
      </Panel>
    </div>
  );
}

function Heatmap({ rows }: { rows: Dict[] }) {
  const grid = pivotHeatmap(rows);
  if (!grid.roads.length) return <Empty />;
  return (
    <div className="heatmap-wrap">
      <table className="heatmap">
        <thead>
          <tr><th />{grid.blocks.map(b => <th key={b}>{b}</th>)}</tr>
        </thead>
        <tbody>
          {grid.roads.map(road => (
            <tr key={road.road_id}>
              <th scope="row">{road.road_name}</th>
              {road.cells.map(cell => {
                const level = cell.high_percent === null || !grid.max ? 0 : cell.high_percent / grid.max;
                return (
                  <td
                    key={cell.time_block}
                    title={cell.high_percent === null ? `${road.road_name} · ${cell.time_block}: no readings` : `${road.road_name} · ${cell.time_block}: ${cell.high_percent}% High across ${cell.readings} readings`}
                    style={cell.high_percent === null ? undefined : { background: `rgba(219, 98, 94, ${0.08 + 0.72 * level})`, color: level > 0.55 ? "#fff" : undefined }}
                  >
                    {cell.high_percent === null ? "–" : fmt(cell.high_percent, 0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="heat-legend">Share of readings reported as High congestion (%). Darker is worse; a dash means no readings in the current scope.</p>
    </div>
  );
}

function RoadsAndAreas({ data, areas }: { data: Dict; areas: string[] }) {
  const byArea: Record<string, Dict[]> = {};
  for (const road of data.roads || []) (byArea[road.area] ??= []).push(road);
  return (
    <>
      <Panel title="Congestion heatmap" sub="High-congestion share by road and time block">
        <Heatmap rows={data.heatmap || []} />
      </Panel>
      <Panel title="Roads grouped by area" sub="Not a map: the source has no coordinates">
        <div className="area-grid">
          {areas.map((area, i) => {
            const rows = byArea[area] || [];
            const volume = rows.reduce((sum, r) => sum + Number(r.recorded_volume || 0), 0);
            const max = Math.max(1, ...rows.map(r => Number(r.recorded_volume || 0)));
            return (
              <div className="area-card" key={area}>
                <div className="area-card-head">
                  <div><span className="area-index">0{i + 1}</span><h3>{area}</h3></div>
                  <span className="area-loc"><Map size={13} /> {rows.length} roads</span>
                </div>
                <div className="area-total">{fmt(volume)} <small>reported volume</small></div>
                <div className="road-bars">
                  {rows.slice(0, 4).map(r => (
                    <div className="road-bar" key={r.road_id}>
                      <div><span>{r.road_name}</span><b>{fmt(r.recorded_volume)}</b></div>
                      <i><em style={{ width: `${Math.max(4, (100 * Number(r.recorded_volume || 0)) / max)}%` }} /></i>
                    </div>
                  ))}
                  {!rows.length && <Empty>No road readings in this scope.</Empty>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function Operations({ filters }: { filters: Filters }) {
  const { data, error, loading, reload } = useApi("operations", filters);
  if (error) return <ErrorCard message={error} retry={reload} />;
  if (loading || !data) return <Loading>Querying operational columns…</Loading>;
  const k = data.kpis || {};
  return (
    <>
      <div className="metric-grid">
        <Metric icon={Gauge} label="Capacity utilization" value={fmtOr(k.capacity_utilization, 1, "%")} hint="Mean of source readings" />
        <Metric icon={Activity} label="Travel-time index" value={fmtOr(k.travel_time_index, 2)} hint="Mean; higher means slower trips" tone="amber" />
        <Metric icon={Server} label="Signal compliance" value={fmtOr(k.signal_compliance, 1, "%")} hint="Mean of source readings" tone="teal" />
        <Metric icon={Map} label="Incident reports" value={fmt(k.incidents)} hint="Total in current scope" tone="red" />
      </div>
      <div className="metric-grid">
        <Metric icon={Activity} label="Public transport usage" value={fmtOr(k.public_transport_usage, 1, "%")} hint="Mean of source readings" tone="teal" />
        <Metric icon={Map} label="Parking usage" value={fmtOr(k.parking_usage, 1, "%")} hint="Mean of source readings" tone="purple" />
        <Metric icon={Users} label="Pedestrians" value={fmtOr(k.pedestrians)} hint="Mean count per reading" tone="purple" />
        <Metric icon={Gauge} label="Environmental impact" value={fmtOr(k.environmental_impact, 1)} hint="Mean; source unit not documented" tone="amber" />
      </div>

      <div className="chart-grid">
        <Panel title="Capacity and signal compliance by time block" sub="Percent, mean of source readings">
          <ChartFrame>
            {data.timeBlocks?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.timeBlocks}>
                  <CartesianGrid stroke="#edf1f6" vertical={false} />
                  <XAxis dataKey="time_block" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} width={36} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="capacity_utilization" name="Capacity utilization" fill="#4786cf" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="signal_compliance" name="Signal compliance" fill="#39a681" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </ChartFrame>
        </Panel>
        <Panel title="Incident reports by time block" sub="Total reports in the source rows">
          <ChartFrame>
            {data.timeBlocks?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.timeBlocks}>
                  <CartesianGrid stroke="#edf1f6" vertical={false} />
                  <XAxis dataKey="time_block" tick={{ fontSize: 11 }} />
                  <YAxis width={40} />
                  <Tooltip />
                  <Bar dataKey="incidents" name="Incident reports" fill="#db625e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </ChartFrame>
        </Panel>
      </div>

      <div className="split-grid">
        <Panel title="Roadwork versus none" sub="Descriptive comparison, not causal evidence">
          <GridTable
            rows={data.roadwork || []}
            columns={[
              ["roadwork_status", "STATUS", r => <b>{r.roadwork_status}</b>],
              ["readings", "READINGS", r => fmt(r.readings)],
              ["average_speed", "AVG SPEED", r => fmtOr(r.average_speed, 1)],
              ["travel_time_index", "TRAVEL-TIME INDEX", r => fmtOr(r.travel_time_index, 2)],
              ["incidents", "INCIDENTS", r => fmt(r.incidents)],
            ]}
          />
        </Panel>
        <Panel title="Roads with the most incident reports" sub="Top 10">
          <GridTable
            rows={data.roads || []}
            columns={[
              ["road_name", "ROAD", r => <><b>{r.road_name}</b><small className="subcell">{r.area}</small></>],
              ["incidents", "INCIDENTS", r => fmt(r.incidents)],
              ["signal_compliance", "SIGNAL", r => fmtOr(r.signal_compliance, 1, "%")],
              ["capacity_utilization", "CAPACITY", r => fmtOr(r.capacity_utilization, 1, "%")],
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

function LatestRows({ rows }: { rows: Dict[] }) {
  return (
    <Panel title="Latest matching source rows" sub="Most recent 50 rows from the active import">
      <GridTable
        rows={rows}
        columns={[
          ["observation_date", "DATE", r => r.observation_date],
          ["area", "AREA", r => r.area],
          ["road_name", "ROAD", r => r.road_name],
          ["time_block", "TIME BLOCK", r => r.time_block],
          ["vehicle_count", "REPORTED VOLUME", r => fmt(r.vehicle_count)],
          ["average_speed", "SPEED", r => fmt(r.average_speed, 1)],
          ["congestion_level", "CONGESTION", r => <span className={r.congestion_level === "High" ? "pill-red" : "pill-blue"}>{r.congestion_level}</span>],
          ["weather", "WEATHER", r => r.weather],
        ]}
      />
    </Panel>
  );
}
