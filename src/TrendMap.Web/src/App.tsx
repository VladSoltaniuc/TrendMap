import { FormEvent, useState } from "react";
import { TrendChart } from "./TrendChart";
import { SearchBar } from "./components/SearchBar";
import { ResultMeta } from "./components/ResultMeta";
import { ErrorBanner } from "./components/ErrorBanner";
import { EmptyState } from "./components/EmptyState";
import { ChartSkeleton } from "./components/ChartSkeleton";
import { ChartErrorBoundary } from "./components/ChartErrorBoundary";
import { NoDataPanel } from "./components/NoDataPanel";
import {
  useTrendQuery,
  useAutoRunFromUrl,
  writeUrlParams,
  type QueryParams,
} from "./hooks/useTrendQuery";
import { useRecentSearches } from "./hooks/useRecentSearches";
import type { TrendResponse } from "./api";

const DEFAULTS: QueryParams = { keyword: "", geo: "", timeframe: "today 5-y" };

// Same cap as TrendChart so the legend label matches what's actually drawn.
function visibleForecastLabel(data: TrendResponse): string {
  if (data.forecast.length === 0 || data.historical.length === 0)
    return "Forecast";
  const cap = Math.min(
    data.forecast.length,
    Math.max(12, data.historical.length),
  );
  const first = new Date(data.forecast[0].date);
  const last = new Date(data.forecast[cap - 1].date);
  const spanDays = Math.max(
    1,
    Math.round((last.getTime() - first.getTime()) / 86_400_000),
  );
  if (spanDays >= 365) {
    const years = Math.max(1, Math.round(spanDays / 365));
    return `Forecast (next ${years} year${years === 1 ? "" : "s"})`;
  }
  if (spanDays >= 60) {
    const months = Math.max(1, Math.round(spanDays / 30));
    return `Forecast (next ${months} months)`;
  }
  if (spanDays >= 14) {
    const weeks = Math.max(1, Math.round(spanDays / 7));
    return `Forecast (next ${weeks} weeks)`;
  }
  return `Forecast (next ${spanDays} days)`;
}

export function App() {
  const { state, run } = useTrendQuery();
  const initial = useAutoRunFromUrl(run, DEFAULTS);
  const { recent, remember } = useRecentSearches();

  const [keyword, setKeyword] = useState(initial.keyword);
  const [geo, setGeo] = useState(initial.geo);
  const [timeframe, setTimeframe] = useState(initial.timeframe);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) return;
    const params: QueryParams = { keyword: trimmed, geo, timeframe };
    writeUrlParams(params);
    remember(trimmed);
    await run(params);
  }

  function applyExample(ex: QueryParams) {
    setKeyword(ex.keyword);
    setGeo(ex.geo);
    setTimeframe(ex.timeframe);
    writeUrlParams(ex);
    remember(ex.keyword);
    void run(ex);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>
          <svg
            className="logo"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="14 7 21 7 21 14" />
          </svg>
          TrendMap
        </h1>
        <p className="tagline">Search a topic. See the past. Glimpse the future.</p>
      </header>

      <SearchBar
        keyword={keyword}
        geo={geo}
        timeframe={timeframe}
        loading={state.kind === "loading"}
        recent={recent}
        onKeyword={setKeyword}
        onGeo={setGeo}
        onTimeframe={setTimeframe}
        onSubmit={onSubmit}
      />

      {state.kind === "error" && <ErrorBanner message={state.message} />}

      {state.kind === "loading" && <ChartSkeleton />}

      {state.kind === "success" && state.data.historical.length === 0 && (
        <NoDataPanel data={state.data} />
      )}

      {state.kind === "success" && state.data.historical.length > 0 && (
        <section className="results">
          <ResultMeta data={state.data} />
          <ChartErrorBoundary>
            <TrendChart data={state.data} />
          </ChartErrorBoundary>
          <div className="legend-note">
            <span className="legend-note-item">
              <span className="dot solid" aria-hidden="true" /> Historical
            </span>
            <span className="legend-note-item">
              <span className="dot dashed" aria-hidden="true" /> {visibleForecastLabel(state.data)}
            </span>
          </div>
        </section>
      )}

      {state.kind === "idle" && <EmptyState onPick={applyExample} />}
    </div>
  );
}
