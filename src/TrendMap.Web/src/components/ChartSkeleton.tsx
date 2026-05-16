export function ChartSkeleton() {
  return (
    <div className="results">
      <div className="meta skeleton-meta" aria-hidden="true">
        Loading…
      </div>
      <div
        className="chart-skeleton"
        role="status"
        aria-label="Loading chart"
      />
    </div>
  );
}
