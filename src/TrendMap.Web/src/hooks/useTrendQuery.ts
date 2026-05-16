import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTrend, type TrendResponse } from "../api";

export type QueryState =
  | { kind: "idle" }
  | { kind: "loading"; keyword: string; geo: string; timeframe: string }
  | { kind: "error"; message: string }
  | { kind: "success"; data: TrendResponse };

export interface QueryParams {
  keyword: string;
  geo: string;
  timeframe: string;
}

export function useTrendQuery(): {
  state: QueryState;
  run: (params: QueryParams) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<QueryState>({ kind: "idle" });
  const latest = useRef(0);

  const run = useCallback(async (params: QueryParams) => {
    const ticket = ++latest.current;
    setState({ kind: "loading", ...params });
    try {
      const data = await fetchTrend(params.keyword, params.geo, params.timeframe);
      if (ticket !== latest.current) return; // stale response
      setState({ kind: "success", data });
    } catch (err) {
      if (ticket !== latest.current) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ kind: "error", message });
    }
  }, []);

  const reset = useCallback(() => {
    latest.current++;
    setState({ kind: "idle" });
  }, []);

  return { state, run, reset };
}

export function readUrlParams(defaults: QueryParams): QueryParams {
  if (typeof window === "undefined") return defaults;
  const sp = new URLSearchParams(window.location.search);
  return {
    keyword: sp.get("q") ?? defaults.keyword,
    geo: sp.get("geo") ?? defaults.geo,
    timeframe: sp.get("tf") ?? defaults.timeframe,
  };
}

export function writeUrlParams(params: QueryParams): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams();
  if (params.keyword) sp.set("q", params.keyword);
  if (params.geo) sp.set("geo", params.geo);
  if (params.timeframe) sp.set("tf", params.timeframe);
  const search = sp.toString();
  const url = search ? `?${search}` : window.location.pathname;
  window.history.replaceState({}, "", url);
}

export function useAutoRunFromUrl(
  run: (p: QueryParams) => void,
  fallback: QueryParams,
): QueryParams {
  const [initial] = useState(() => readUrlParams(fallback));
  useEffect(() => {
    if (initial.keyword.trim()) run(initial);
    // intentionally only runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return initial;
}
