export interface TrendPoint {
  date: string;
  value: number;
}

export interface ForecastPoint {
  date: string;
  value: number;
}

export interface TrendResponse {
  keyword: string;
  geo: string;
  timeframe: string;
  historical: TrendPoint[];
  forecast: ForecastPoint[];
  fromCache: boolean;
  isMock: boolean;
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}

export async function fetchTrend(
  keyword: string,
  geo: string,
  timeframe: string
): Promise<TrendResponse> {
  const res = await fetch("/api/trends", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ keyword, geo, timeframe }),
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res));
  }
  return res.json();
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ProblemDetails & { error?: string };
    // RFC 7807 ProblemDetails: prefer `detail`, then `title`.
    return body.detail ?? body.title ?? body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
