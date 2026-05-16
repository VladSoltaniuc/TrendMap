interface Example {
  keyword: string;
  geo: string;
  timeframe: string;
  label: string;
}

const EXAMPLES: Example[] = [
  { keyword: "bitcoin", geo: "US", timeframe: "today 5-y", label: "bitcoin · US" },
  { keyword: "chatgpt", geo: "", timeframe: "today 12-m", label: "chatgpt · Worldwide" },
  { keyword: "electric car", geo: "DE", timeframe: "today 5-y", label: "electric car · Germany" },
  { keyword: "world cup", geo: "BR", timeframe: "today 5-y", label: "world cup · Brazil" },
  { keyword: "taylor swift", geo: "US", timeframe: "today 12-m", label: "taylor swift · US" },
  { keyword: "vacanta", geo: "RO", timeframe: "today 5-y", label: "vacanta · Romania" },
];

interface Props {
  onPick: (e: { keyword: string; geo: string; timeframe: string }) => void;
}

export function EmptyState({ onPick }: Props) {
  return (
    <div className="empty">
      <p>Enter a keyword above to fetch its trend history and forecast the future.</p>
      <p className="empty-or">— or try an example —</p>
      <div className="chips">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="chip"
            onClick={() => onPick(ex)}
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
