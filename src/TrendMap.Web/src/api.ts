export interface TrendPoint {
  date: string;
  value: number;
}

export interface ForecastPoint {
  date: string;
  value: number;
  lowerBound: number;
  upperBound: number;
}

export interface TrendResponse {
  keyword: string;
  geo: string;
  timeframe: string;
  historical: TrendPoint[];
  forecast: ForecastPoint[];
  fromCache: boolean;
}

export async function fetchTrend(
  keyword: string,
  geo: string,
  timeframe: string
): Promise<TrendResponse> {
  const res = await fetch("/api/trends", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, geo, timeframe }),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}
