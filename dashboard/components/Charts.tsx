"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  type Complaints, type Property, topicLabel, type WeeklyAverageRow, type WeeklySentimentRow,
} from "@/lib/metrics";
import { Empty, SENTIMENT_COLOURS } from "./ui";

const AXIS = { fontSize: 14, fill: "#666666" };
const GRID = "#e7e7e7";
// Legend labels stay in normal text colour; the coloured marker beside them carries identity.
const legendText = (value: string) => <span style={{ color: "#191919" }}>{value}</span>;

export function WeeklyRatingChart({
  rows, properties, colours,
}: { rows: WeeklyAverageRow[]; properties: Property[]; colours: Record<string, string> }) {
  const hasData = rows.some((r) => properties.some((p) => r[p.id] !== null));
  if (!hasData) return <Empty>No reviews in the last 12 weeks yet.</Empty>;
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c2c2c2" }} />
        <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={AXIS} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          labelFormatter={(label) => `Week starting ${label}`}
          formatter={(value: number, name: string) => [`${value.toFixed(1)} / 10`, name]}
        />
        <Legend formatter={legendText} />
        {properties.map((p) => (
          <Line
            key={p.id} dataKey={p.id} name={p.name} stroke={colours[p.id]} strokeWidth={2}
            dot={{ r: 4, strokeWidth: 0, fill: colours[p.id] }} connectNulls isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeeklySentimentChart({ rows }: { rows: WeeklySentimentRow[] }) {
  if (!rows.some((r) => r.positive + r.neutral + r.negative > 0))
    return <Empty>No reviews in the last 12 weeks yet.</Empty>;
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#c2c2c2" }} />
        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={32} />
        <Tooltip labelFormatter={(label) => `Week starting ${label}`} cursor={{ fill: "#f3f3f3" }} />
        <Legend formatter={legendText} />
        <Bar dataKey="negative" name="Negative (below 6)" stackId="s" fill={SENTIMENT_COLOURS.negative} stroke="#ffffff" strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="neutral" name="Neutral (6 to 7.9)" stackId="s" fill={SENTIMENT_COLOURS.neutral} stroke="#ffffff" strokeWidth={2} isAnimationActive={false} />
        <Bar dataKey="positive" name="Positive (8 and above)" stackId="s" fill={SENTIMENT_COLOURS.positive} stroke="#ffffff" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ComplaintChart({ complaints }: { complaints: Complaints }) {
  const rows = complaints.topics.map((t) => ({ ...t, name: topicLabel(t.topic) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 44)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 16, fill: "#191919" }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "#f3f3f3" }}
          formatter={(value: number) => [`${value} of ${complaints.negativeCount} negative reviews`, "Mentioned in"]}
        />
        <Bar dataKey="count" fill="#257de0" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false}
          label={{ position: "right", fill: "#191919", fontSize: 16 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
