import { REGIONS } from "../regions";
import type { TrendResponse } from "../api";

export function ResultMeta({ data }: { data: TrendResponse }) {
  const regionName =
    REGIONS.find((r) => r.code === data.geo)?.name ?? data.geo ?? "Worldwide";
  return (
    <div className="meta" aria-live="polite">
      <strong>{data.keyword}</strong>
      <span aria-hidden="true"> · </span>
      {regionName}
      <span aria-hidden="true"> · </span>
      {data.timeframe}
      {data.fromCache && (
        <span className="cache-tag" title="Served from in-memory cache">
          cached
        </span>
      )}
      {data.isMock && (
        <span
          className="mock-tag"
          title="Upstream is rate-limited. This data is simulated and should not be used for decisions."
        >
          ⚠ Rate limited — showing mock data
        </span>
      )}
    </div>
  );
}
