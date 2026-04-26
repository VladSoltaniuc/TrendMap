import { useState, FormEvent } from "react";
import { fetchTrend, type TrendResponse } from "./api";
import { REGIONS, TIMEFRAMES } from "./regions";
import { TrendChart } from "./TrendChart";

export function App() {
  const [keyword, setKeyword] = useState("");
  const [geo, setGeo] = useState("");
  const [timeframe, setTimeframe] = useState("today 5-y");
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTrend(keyword.trim(), geo, timeframe);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>TrendMap</h1>
        <p className="tagline">Search a topic. See the past. Glimpse the future.</p>
      </header>

      <form className="search" onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="Search a keyword (e.g. 'bitcoin')"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          autoFocus
        />
        <select value={geo} onChange={(e) => setGeo(e.target.value)}>
          {REGIONS.map((r) => (
            <option key={r.code || "WW"} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
          {TIMEFRAMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading || !keyword.trim()}>
          {loading ? "Loading…" : "Search"}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {data && !error && (
        <section className="results">
          <div className="meta">
            <strong>{data.keyword}</strong> ·{" "}
            {REGIONS.find((r) => r.code === data.geo)?.name ?? data.geo ?? "Worldwide"} ·{" "}
            {data.timeframe}
            {data.fromCache && <span className="cache-tag">cached</span>}
          </div>
          <TrendChart data={data} />
          <div className="legend-note">
            <span className="dot solid" /> Historical (Google Trends)
            <span className="dot dashed" /> Forecast (next 12 months)
          </div>
        </section>
      )}

      {!data && !error && !loading && (
        <div className="empty">
          Enter a keyword above to fetch its Google Trends history and a 12-month forecast.
        </div>
      )}
    </div>
  );
}
