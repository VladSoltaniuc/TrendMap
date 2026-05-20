import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { REGIONS, TIMEFRAMES } from "../regions";
import { useWordSuggestion } from "../hooks/useWordSuggestion";

interface Props {
  keyword: string;
  geo: string;
  timeframe: string;
  loading: boolean;
  recent: string[];
  onKeyword: (v: string) => void;
  onGeo: (v: string) => void;
  onTimeframe: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function SearchBar(p: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // After the user accepts a completion, hold the ghost off until they
  // shorten the input — typing more, leaving as-is, or hitting Enter
  // again should not re-trigger another suggestion.
  const [suppressedFor, setSuppressedFor] = useState<string | null>(null);
  const isSuppressed =
    suppressedFor !== null && p.keyword.length >= suppressedFor.length;
  // Once the user actually deletes (input shorter than the suppression
  // baseline), drop the flag and let suggestions resume.
  if (suppressedFor !== null && p.keyword.length < suppressedFor.length) {
    setSuppressedFor(null);
  }

  // Recent searches take priority over the dictionary so the user's own
  // history is reinforced.
  const liveCompletion = useWordSuggestion(p.keyword, p.recent);

  // Keep one suggestion stable while it still completes what's typed, instead
  // of flickering between dictionary hits on every keystroke. As soon as the
  // locked word no longer fits (you typed past it), a fresh suggestion takes
  // over.
  const [lockedCompletion, setLockedCompletion] = useState<string | null>(null);

  const lockFits =
    lockedCompletion !== null &&
    lockedCompletion.length > p.keyword.length &&
    lockedCompletion.toLowerCase().startsWith(p.keyword.toLowerCase());

  const candidate = lockFits ? lockedCompletion : liveCompletion;
  const remainder =
    !isSuppressed &&
    p.keyword.length > 0 &&
    candidate &&
    candidate.length > p.keyword.length &&
    candidate.toLowerCase().startsWith(p.keyword.toLowerCase())
      ? candidate.slice(p.keyword.length)
      : "";

  // Lock whatever is currently shown so it stays stable while it matches;
  // re-lock when the previous one stops fitting and a fresh hit is available.
  useEffect(() => {
    if (!lockFits && remainder && liveCompletion) {
      setLockedCompletion(liveCompletion);
    }
  }, [lockFits, remainder, liveCompletion]);

  function acceptCompletion(): boolean {
    if (!remainder) return false;
    const accepted = p.keyword + remainder;
    p.onKeyword(accepted);
    setSuppressedFor(accepted);
    // Move caret to the end on the next tick.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
    return true;
  }

  function caretAtEnd(): boolean {
    const el = inputRef.current;
    if (!el) return true;
    return el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
  }

  function onFormSubmit(e: FormEvent) {
    // The ghost is purely a visual hint — Enter searches exactly what's typed
    // and ignores the suggestion. Reset the autocomplete state once the search
    // fires so it starts fresh next time the user edits the input.
    setLockedCompletion(null);
    setSuppressedFor(p.keyword);
    p.onSubmit(e);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab" && remainder) {
      e.preventDefault();
      acceptCompletion();
      return;
    }
    if (e.key === "ArrowRight" && remainder && caretAtEnd()) {
      e.preventDefault();
      acceptCompletion();
      return;
    }
    if (e.key === "Escape" && remainder) {
      // Dismiss the current ghost without changing the input. Reuses the
      // existing suppression rule: nothing new will appear until the user
      // shortens the keyword.
      e.preventDefault();
      setSuppressedFor(p.keyword);
      setLockedCompletion(null);
      return;
    }
  }

  return (
    <form className="search" onSubmit={onFormSubmit} role="search" aria-label="Search trends">
      <div className="ghost-input">
        <div className="ghost-surface" aria-hidden="true" />
        <div className="ghost-text" aria-hidden="true">
          <span className="ghost-typed">{p.keyword}</span>
          <span className="ghost-completion">{remainder}</span>
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search a keyword (e.g. 'bitcoin')"
          aria-label="Keyword"
          value={p.keyword}
          onChange={(e) => p.onKeyword(e.target.value)}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
        />
      </div>
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
