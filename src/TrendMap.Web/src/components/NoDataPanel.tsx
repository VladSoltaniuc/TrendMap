import { REGIONS } from "../regions";
import type { TrendResponse } from "../api";

interface Props {
  data: TrendResponse;
}

export function NoDataPanel({ data }: Props) {
  const regionName =
    REGIONS.find((r) => r.code === data.geo)?.name ?? data.geo ?? "Worldwide";

  return (
    <section className="no-data" aria-live="polite">
      <svg
        className="no-data-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <h2 className="no-data-title">No trend data for this combination</h2>
      <p className="no-data-body">
        We couldn't find enough search activity for{" "}
        <strong>"{data.keyword}"</strong> in <strong>{regionName}</strong> over the
        selected timeframe to draw a chart.
      </p>
      <ul className="no-data-tips">
        <li>Try a more common keyword or check the spelling.</li>
        <li>Widen the timeframe (e.g. Past 12 months or Past 5 years).</li>
        <li>Switch the region — "Worldwide" usually has the most volume.</li>
      </ul>
    </section>
  );
}
