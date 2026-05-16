import { FormEvent } from "react";
import { REGIONS, TIMEFRAMES } from "../regions";

interface Props {
  keyword: string;
  geo: string;
  timeframe: string;
  loading: boolean;
  onKeyword: (v: string) => void;
  onGeo: (v: string) => void;
  onTimeframe: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function SearchBar(p: Props) {
  return (
    <form className="search" onSubmit={p.onSubmit} role="search" aria-label="Search trends">
      <input
        type="text"
        placeholder="Search a keyword (e.g. 'bitcoin')"
        aria-label="Keyword"
        value={p.keyword}
        onChange={(e) => p.onKeyword(e.target.value)}
        autoFocus
      />
      <select
        aria-label="Region"
        value={p.geo}
        onChange={(e) => p.onGeo(e.target.value)}
      >
        {REGIONS.map((r) => (
          <option key={r.code || "WW"} value={r.code}>
            {r.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Timeframe"
        value={p.timeframe}
        onChange={(e) => p.onTimeframe(e.target.value)}
      >
        {TIMEFRAMES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={p.loading || !p.keyword.trim()}>
        {p.loading ? "Loading…" : "Search"}
      </button>
    </form>
  );
}
