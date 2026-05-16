import { FormEvent, useState } from "react";
import { TrendChart } from "./TrendChart";
import { SearchBar } from "./components/SearchBar";
import { ResultMeta } from "./components/ResultMeta";
import { ErrorBanner } from "./components/ErrorBanner";
import { EmptyState } from "./components/EmptyState";
import { ChartSkeleton } from "./components/ChartSkeleton";
import { ChartErrorBoundary } from "./components/ChartErrorBoundary";
import {
  useTrendQuery,
  useAutoRunFromUrl,
  writeUrlParams,
  type QueryParams,
} from "./hooks/useTrendQuery";

const DEFAULTS: QueryParams = { keyword: "", geo: "", timeframe: "today 5-y" };

export function App() {
  const { state, run } = useTrendQuery();
  const initial = useAutoRunFromUrl(run, DEFAULTS);

  const [keyword, setKeyword] = useState(initial.keyword);
  const [geo, setGeo] = useState(initial.geo);
  const [timeframe, setTimeframe] = useState(initial.timeframe);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) return;
    const params: QueryParams = { keyword: trimmed, geo, timeframe };
    writeUrlParams(params);
    await run(params);
  }

  function applyExample(ex: QueryParams) {
    setKeyword(ex.keyword);
    setGeo(ex.geo);
    setTimeframe(ex.timeframe);
    writeUrlParams(ex);
    void run(ex);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>TrendMap</h1>
        <p className="tagline">Search a topic. See the past. Glimpse the future.</p>
      </header>

      <SearchBar
        keyword={keyword}
        geo={geo}
        timeframe={timeframe}
        loading={state.kind === "loading"}
        onKeyword={setKeyword}
        onGeo={setGeo}
        onTimeframe={setTimeframe}
        onSubmit={onSubmit}
      />

      {state.kind === "error" && <ErrorBanner message={state.message} />}

      {state.kind === "loading" && <ChartSkeleton />}

      {state.kind === "success" && (
        <section className="results">
          <ResultMeta data={state.data} />
          <ChartErrorBoundary>
            <TrendChart data={state.data} />
          </ChartErrorBoundary>
          <div className="legend-note">
            <span className="dot solid" /> Historical
            <span className="dot dashed" /> Forecast (next 12 months)
          </div>
        </section>
      )}

      {state.kind === "idle" && <EmptyState onPick={applyExample} />}
    </div>
  );
}
