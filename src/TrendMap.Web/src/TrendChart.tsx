import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface View {
  start: number;
  end: number;
}

interface PinchState {
  initialDistance: number;
  initialView: View;
  centerIndex: number;
}

const MIN_WINDOW = 4;
const ZOOM_STEP = 1.2;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Inputs are ISO date strings "YYYY-MM-DD".
function formatMonthDay(d: string): string {
  const monthIdx = Number(d.slice(5, 7)) - 1;
  const day = d.slice(8, 10);
  const month = MONTHS_SHORT[monthIdx] ?? d.slice(5, 7);
  return `${month} ${day}`;
}

function formatMonthYear(d: string): string {
  const monthIdx = Number(d.slice(5, 7)) - 1;
  const year = d.slice(0, 4);
  const month = MONTHS_SHORT[monthIdx] ?? d.slice(5, 7);
  return `${month} ${year}`;
}

// Distance between two touches.
function touchDistance(t1: Touch, t2: Touch): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

export function TrendChart({ data }: Props) {
  const rows = useMemo<MergedRow[]>(() => {
    const map = new Map<string, MergedRow>();
    for (const p of data.historical) {
      map.set(p.date, { date: p.date, historical: p.value });
    }
    const lastHist = data.historical[data.historical.length - 1];
    if (lastHist) {
      const existing = map.get(lastHist.date) ?? { date: lastHist.date };
      existing.forecast = lastHist.value;
      map.set(lastHist.date, existing);
    }
    // Cap the visible forecast so it never dwarfs the historical window.
    // The backend always projects ~365 days forward regardless of cadence;
    // for a 30-day daily query that's a 12x-wide forecast tail.
    const forecastCap = Math.min(
      data.forecast.length,
      Math.max(12, data.historical.length),
    );
    for (let i = 0; i < forecastCap; i++) {
      const p = data.forecast[i];
      const existing = map.get(p.date) ?? { date: p.date };
      existing.forecast = p.value;
      map.set(p.date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const fullView: View = useMemo(
    () => ({ start: 0, end: Math.max(0, rows.length - 1) }),
    [rows.length],
  );

  const [view, setView] = useState<View>(fullView);

  // Reset zoom when the underlying dataset changes (new keyword / timeframe / region).
  useEffect(() => {
    setView(fullView);
  }, [fullView]);

  const isZoomed = view.start !== 0 || view.end !== rows.length - 1;
  const canZoom = rows.length > MIN_WINDOW + 1;

  const visible = useMemo(
    () => rows.slice(view.start, view.end + 1),
    [rows, view.start, view.end],
  );

  // Pick an X-axis label format from what's currently *visible*. We base the
  // choice on whether the visible window crosses calendar years, so e.g.
  // "Past 90 days" never shows year-dominated "YYYY-MM" labels.
  const tickFormatter = useMemo(() => {
    if (visible.length < 2) return (d: string) => d;
    const firstYear = visible[0].date.slice(0, 4);
    const lastYear = visible[visible.length - 1].date.slice(0, 4);
    const first = new Date(visible[0].date);
    const last = new Date(visible[visible.length - 1].date);
    const spanDays = (last.getTime() - first.getTime()) / 86_400_000;
    // Same calendar year → year is redundant, show month-day (e.g. "Apr 19").
    if (firstYear === lastYear) return formatMonthDay;
    // Multi-year but short — show month-year (e.g. "Apr 2026").
    if (spanDays <= 1100) return formatMonthYear;
    // Long horizons (5y, 10y) → year is the only readable resolution.
    return (d: string) => d.slice(0, 4);
  }, [visible]);

  const resetZoom = useCallback(() => {
    setView(fullView);
  }, [fullView]);

  // Wheel + pinch are not part of Recharts' API — attach to the wrapper directly.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Translate a clientX over the wrapper into an index in the *full* rows array,
  // based on the current visible window.
  const indexAtClientX = useCallback(
    (clientX: number): number => {
      const el = wrapRef.current;
      if (!el) return viewRef.current.start;
      const rect = el.getBoundingClientRect();
      const width = rect.width || 1;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / width));
      const v = viewRef.current;
      const len = v.end - v.start + 1;
      return v.start + Math.round(ratio * (len - 1));
    },
    [],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    function clampView(start: number, end: number): View {
      const total = rows.length;
      if (total === 0) return { start: 0, end: 0 };
      let s = Math.max(0, Math.min(total - 1, start));
      let e = Math.max(0, Math.min(total - 1, end));
      if (e - s + 1 < MIN_WINDOW) {
        // Expand around midpoint to satisfy minimum window.
        const mid = Math.round((s + e) / 2);
        s = Math.max(0, mid - Math.floor(MIN_WINDOW / 2));
        e = Math.min(total - 1, s + MIN_WINDOW - 1);
        s = Math.max(0, e - MIN_WINDOW + 1);
      }
      return { start: s, end: e };
    }

    function onWheel(ev: WheelEvent) {
      if (!canZoom) return;
      ev.preventDefault();
      const v = viewRef.current;
      const len = v.end - v.start + 1;
      const center = indexAtClientX(ev.clientX);
      const factor = ev.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      let newLen = Math.round(len * factor);
      newLen = Math.max(MIN_WINDOW, Math.min(rows.length, newLen));
      if (newLen === len) return;
      // Keep `center` at the same fractional position within the new window.
      const ratio = len > 1 ? (center - v.start) / (len - 1) : 0.5;
      const newStart = Math.round(center - ratio * (newLen - 1));
      const newEnd = newStart + newLen - 1;
      setView(clampView(newStart, newEnd));
    }

    function onTouchStart(ev: TouchEvent) {
      if (!canZoom || ev.touches.length !== 2) return;
      const [a, b] = [ev.touches[0], ev.touches[1]];
      const midX = (a.clientX + b.clientX) / 2;
      pinchRef.current = {
        initialDistance: touchDistance(a, b),
        initialView: viewRef.current,
        centerIndex: indexAtClientX(midX),
      };
    }

    function onTouchMove(ev: TouchEvent) {
      const p = pinchRef.current;
      if (!p || ev.touches.length !== 2) return;
      ev.preventDefault();
      const dist = touchDistance(ev.touches[0], ev.touches[1]);
      if (dist <= 0 || p.initialDistance <= 0) return;
      const scale = dist / p.initialDistance;
      const initialLen = p.initialView.end - p.initialView.start + 1;
      let newLen = Math.round(initialLen / scale);
      newLen = Math.max(MIN_WINDOW, Math.min(rows.length, newLen));
      const ratio =
        initialLen > 1 ? (p.centerIndex - p.initialView.start) / (initialLen - 1) : 0.5;
      const newStart = Math.round(p.centerIndex - ratio * (newLen - 1));
      const newEnd = newStart + newLen - 1;
      setView(clampView(newStart, newEnd));
    }

    function onTouchEnd(ev: TouchEvent) {
      if (ev.touches.length < 2) pinchRef.current = null;
    }

    function onDoubleClick() {
      setView({ start: 0, end: Math.max(0, rows.length - 1) });
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("dblclick", onDoubleClick);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("dblclick", onDoubleClick);
    };
  }, [canZoom, indexAtClientX, rows.length]);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {isZoomed && (
        <button
          type="button"
          className="zoom-reset"
          onClick={resetZoom}
          aria-label="Reset zoom"
          title="Reset zoom (or double-click the chart)"
        >
          Reset zoom
        </button>
      )}
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart
          data={visible}
          margin={{ top: 16, right: 32, left: 16, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#23262f" />
          <XAxis
            dataKey="date"
            stroke="#9aa0a6"
            tickFormatter={tickFormatter}
            minTickGap={48}
            allowDataOverflow
          />
          <YAxis
            stroke="#9aa0a6"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            allowDataOverflow
            label={{
              value: "Units of interest (relative to the highest peak)",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              style: { fill: "#9aa0a6", fontSize: 12, textAnchor: "middle" },
            }}
          />
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
