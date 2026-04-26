import { useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import type { TrendResponse } from "./api";

interface Props {
  data: TrendResponse;
}

interface MergedRow {
  date: string;
  historical?: number;
  forecast?: number;
}

export function TrendChart({ data }: Props) {
  const rows = useMemo<MergedRow[]>(() => {
    const map = new Map<string, MergedRow>();
    for (const p of data.historical) {
      map.set(p.date, { date: p.date, historical: p.value });
    }
    // Bridge: duplicate last historical point as first forecast so lines connect
    const lastHist = data.historical[data.historical.length - 1];
    if (lastHist) {
      const existing = map.get(lastHist.date) ?? { date: lastHist.date };
      existing.forecast = lastHist.value;
      map.set(lastHist.date, existing);
    }
    for (const p of data.forecast) {
      const existing = map.get(p.date) ?? { date: p.date };
      existing.forecast = p.value;
      map.set(p.date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={rows} margin={{ top: 16, right: 32, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#23262f" />
          <XAxis
            dataKey="date"
            stroke="#9aa0a6"
            tickFormatter={(d: string) => d.slice(0, 7)}
            minTickGap={48}
          />
          <YAxis stroke="#9aa0a6" domain={[0, "auto"]} allowDataOverflow={false} />
          <Tooltip
            contentStyle={{ background: "#16181d", border: "1px solid #2a2d36", borderRadius: 6 }}
            labelStyle={{ color: "#e7e9ee" }}
            formatter={(value: number, name: string) => [
              typeof value === "number" ? value.toFixed(1) : value,
              name,
            ]}
          />
          <Line
            type="monotone"
            dataKey="historical"
            stroke="#4f8cff"
            strokeWidth={2}
            dot={false}
            name="Historical"
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#ffb84f"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            name="Forecast"
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
