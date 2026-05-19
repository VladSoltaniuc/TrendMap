import { useEffect, useRef, useState } from "react";

// Datamuse "sug" endpoint: open, no auth, CORS-friendly. Returns up to ~10
// autocomplete suggestions for a prefix. Docs: https://www.datamuse.com/api/
const ENDPOINT = "https://api.datamuse.com/sug";
const DEBOUNCE_MS = 140;
const MIN_QUERY_CHARS = 2;
const MAX_CACHE = 200;

interface DatamuseHit {
  word?: string;
}

const cache = new Map<string, string[]>();

function cachePut(key: string, value: string[]) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
}

async function fetchSuggestions(query: string, signal: AbortSignal): Promise<string[]> {
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const url = `${ENDPOINT}?s=${encodeURIComponent(query)}&max=10`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as DatamuseHit[];
  const words = body
    .map((h) => h.word)
    .filter((w): w is string => typeof w === "string" && w.length > 0);
  cachePut(key, words);
  return words;
}

/**
 * Returns the best ghost-text completion for `query` — i.e. a word that
 * starts with `query` (case-insensitive) but is longer than it.
 *
 * Priority:
 *   1. A `prefer` candidate that prefix-matches (e.g. user's recent searches).
 *   2. The top Datamuse suggestion that prefix-matches.
 *
 * Returns the *full* completion (e.g. for "bit" → "bitcoin"), not just the suffix.
 */
export function useWordSuggestion(query: string, prefer: string[]): string {
  const [remote, setRemote] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_CHARS) {
      setRemote([]);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = window.setTimeout(() => {
      fetchSuggestions(trimmed, ctrl.signal)
        .then((words) => {
          if (!ctrl.signal.aborted) setRemote(words);
        })
        .catch(() => {
          /* network or abort — fall back silently */
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const q = query.trim();
  if (!q) return "";
  const qLower = q.toLowerCase();

  for (const candidate of prefer) {
    if (candidate.length <= q.length) continue;
    if (candidate.toLowerCase().startsWith(qLower)) {
      return q + candidate.slice(q.length);
    }
  }

  for (const word of remote) {
    if (word.length <= q.length) continue;
    if (word.toLowerCase().startsWith(qLower)) {
      return q + word.slice(q.length);
    }
  }

  return "";
}
