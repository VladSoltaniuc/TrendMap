# TrendMap

Search any keyword, see its Google Trends history, and forecast the next 12 months.

- **Backend:** .NET 8 minimal API + ML.NET (Singular Spectrum Analysis forecasting) + Python `pytrends` (subprocess) for Google Trends data
- **Frontend:** React + Vite + TypeScript + Recharts
- **Storage:** in-memory cache only (no database)
- **Deploy:** single Docker image, Railway-ready

Historical data renders as a **solid line**; the 12-month forecast renders as a **dotted line** with a 95% confidence band.

---

## Project layout

```
TrendMap/
├── TrendMap.sln
├── Dockerfile               # multi-stage: node → dotnet sdk → aspnet runtime + python
├── railway.json             # Railway deploy config
├── src/
│   ├── TrendMap.Api/        # .NET 8 minimal API
│   │   ├── Program.cs
│   │   ├── Models/
│   │   ├── Services/
│   │   │   ├── PyTrendsClient.cs    # subprocess wrapper around fetch_trends.py
│   │   │   ├── ForecastService.cs   # ML.NET SSA forecasting
│   │   │   └── TrendsService.cs     # orchestration + memory cache
│   │   └── scripts/
│   │       ├── fetch_trends.py      # pytrends fetcher
│   │       └── requirements.txt
│   └── TrendMap.Web/        # Vite + React + TS
│       └── src/
│           ├── App.tsx
│           ├── TrendChart.tsx
│           ├── api.ts
│           └── regions.ts
```

---

## Local development

### Prerequisites
- .NET 8 SDK
- Node.js 20+
- Python 3.10+ on PATH (`python --version`)

### One-time setup

```bash
# Install Python deps for the trends fetcher
pip install -r src/TrendMap.Api/scripts/requirements.txt

# Install React deps
cd src/TrendMap.Web && npm install && cd ../..
```

### Run (two terminals)

```bash
# Terminal 1 — API on http://localhost:5080
dotnet run --project src/TrendMap.Api

# Terminal 2 — Vite dev server on http://localhost:5173 (proxies /api → :5080)
cd src/TrendMap.Web && npm run dev
```

Open http://localhost:5173.

---

## API

### `POST /api/trends`

```json
{
  "keyword": "bitcoin",
  "geo": "US",
  "timeframe": "today 5-y"
}
```

`geo` is an [ISO-3166 country code](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) or `""` for worldwide.
`timeframe` follows pytrends conventions: `today 5-y`, `today 12-m`, `today 3-m`, `all`, etc.

Response:

```json
{
  "keyword": "bitcoin",
  "geo": "US",
  "timeframe": "today 5-y",
  "historical": [{ "date": "2020-04-26", "value": 12 }, ...],
  "forecast":   [{ "date": "2025-05-04", "value": 33.4, "lowerBound": 21.1, "upperBound": 45.7 }, ...],
  "fromCache": false
}
```

Results are cached in-memory for 60 minutes (configurable in `appsettings.json`).

### `GET /api/health`

Returns `{ "status": "ok" }`. Used by Railway healthchecks.

---

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway, **New Project → Deploy from GitHub** and pick this repo.
3. Railway sees the `Dockerfile` and `railway.json` and uses them automatically — no extra config needed.
4. After the first deploy, generate a public domain in the service's **Settings → Networking** tab.

The image bundles .NET 8 runtime + Python 3 + pytrends in one container, listening on `$PORT` (defaults to `8080`).

### Environment variables (optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `Trends__PythonExecutable` | `/opt/venv/bin/python` (in container) | Path to the Python interpreter the API shells out to |
| `Trends__CacheMinutes` | `60` | How long to cache `(keyword, geo, timeframe)` results |
| `Trends__DefaultTimeframe` | `today 5-y` | Default if request omits `timeframe` |

---

## Notes & limitations

- **Google Trends rate-limits.** `pytrends` hits an unofficial endpoint. Bursts can return HTTP 429; the API surfaces this as a 502 with a clear message. The 60-minute cache is the main mitigation.
- **Forecast is a model, not magic.** SSA captures level + trend + seasonality from the historical series. Volatile or news-driven topics will have wide confidence bands.
- **Single keyword by design.** Comparison of multiple keywords is intentionally omitted to keep the UX focused.
