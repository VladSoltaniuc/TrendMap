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

type GestureState =
  | {
      // Two-finger pinch: zooms (finger spread) and pans (midpoint movement)
      // at the same time, anchored on the data point under the start midpoint.
      kind: "pinch";
      initialView: View;
      initialDistance: number;
      anchorIndex: number;
    }
  | {
      // One-finger horizontal drag: pans the zoomed window left/right.
      kind: "pan";
      initialView: View;
      startX: number;
      startY: number;
      decided: boolean;
      panning: boolean;
    };

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

  // Wheel + touch zoom/pan are not part of Recharts' API — attach to the wrapper directly.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Fractional position (0–1) of a clientX across the wrapper.
  const ratioAtClientX = useCallback((clientX: number): number => {
    const el = wrapRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const width = rect.width || 1;
    return Math.min(1, Math.max(0, (clientX - rect.left) / width));
  }, []);

  // Translate a clientX over the wrapper into an index in the *full* rows array,
  // based on the current visible window.
  const indexAtClientX = useCallback(
    (clientX: number): number => {
      const v = viewRef.current;
      const len = v.end - v.start + 1;
      return v.start + Math.round(ratioAtClientX(clientX) * (len - 1));
    },
    [ratioAtClientX],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    // Position a window of exactly `len` points (clamped to bounds and
    // MIN_WINDOW) starting near `start`. Keeps the window size stable when
    // panning into either edge, instead of shrinking it.
    function clampWindow(start: number, len: number): View {
      const total = rows.length;
      if (total === 0) return { start: 0, end: 0 };
      const L = Math.max(MIN_WINDOW, Math.min(total, len));
      const s = Math.max(0, Math.min(total - L, Math.round(start)));
      return { start: s, end: s + L - 1 };
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
      setView(clampWindow(center - ratio * (newLen - 1), newLen));
    }

    function onTouchStart(ev: TouchEvent) {
      if (!canZoom) return;
      if (ev.touches.length === 2) {
        const [a, b] = [ev.touches[0], ev.touches[1]];
        const midX = (a.clientX + b.clientX) / 2;
        gestureRef.current = {
          kind: "pinch",
          initialView: viewRef.current,
          initialDistance: touchDistance(a, b),
          anchorIndex: indexAtClientX(midX),
        };
      } else if (ev.touches.length === 1) {
        const v = viewRef.current;
        const zoomed = v.start > 0 || v.end < rows.length - 1;
        if (!zoomed) {
          gestureRef.current = null; // not zoomed → let the page scroll
          return;
        }
        const t = ev.touches[0];
        gestureRef.current = {
          kind: "pan",
          initialView: v,
          startX: t.clientX,
          startY: t.clientY,
          decided: false,
          panning: false,
        };
      }
    }

    function onTouchMove(ev: TouchEvent) {
      const g = gestureRef.current;
      if (!g) return;

      if (g.kind === "pinch" && ev.touches.length === 2) {
        ev.preventDefault();
        const [a, b] = [ev.touches[0], ev.touches[1]];
        const dist = touchDistance(a, b);
        if (dist <= 0 || g.initialDistance <= 0) return;
        const scale = dist / g.initialDistance;
        const initialLen = g.initialView.end - g.initialView.start + 1;
        const newLen = Math.max(MIN_WINDOW, Math.min(rows.length, Math.round(initialLen / scale)));
        // Anchor the start data point under the *current* midpoint so the
        // gesture pans (midpoint moves) and zooms (spread changes) together.
        const midX = (a.clientX + b.clientX) / 2;
        const ratio = ratioAtClientX(midX);
        setView(clampWindow(g.anchorIndex - ratio * (newLen - 1), newLen));
        return;
      }

      if (g.kind === "pan" && ev.touches.length === 1) {
        const t = ev.touches[0];
        const dx = t.clientX - g.startX;
        const dy = t.clientY - g.startY;
        if (!g.decided) {
          // Wait for a deliberate move, then lock to the dominant axis.
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          g.decided = true;
          g.panning = Math.abs(dx) > Math.abs(dy);
        }
        if (!g.panning) return; // vertical intent → let the browser scroll
        ev.preventDefault();
        const width = el ? el.getBoundingClientRect().width || 1 : 1;
        const len = g.initialView.end - g.initialView.start + 1;
        // Drag right → reveal earlier data (window moves left).
        const indexDelta = -Math.round((dx / width) * (len - 1));
        setView(clampWindow(g.initialView.start + indexDelta, len));
        return;
      }
    }

    function onTouchEnd(ev: TouchEvent) {
      if (ev.touches.length === 0) {
        gestureRef.current = null;
      } else if (gestureRef.current?.kind === "pinch" && ev.touches.length < 2) {
        gestureRef.current = null;
      }
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
  }, [canZoom, indexAtClientX, ratioAtClientX, rows.length]);

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
