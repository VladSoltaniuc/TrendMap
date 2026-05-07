"""Fetch Google Trends interest-over-time for a keyword and emit JSON to stdout.

Invoked by the .NET API as:
    python fetch_trends.py --keyword "bitcoin" --geo "US" --timeframe "today 5-y"

To avoid 429 rate limits, place a cookies.json file next to this script containing
cookies exported from a logged-in Google Chrome session on trends.google.com.
Use a browser extension like "Cookie-Editor" (export as JSON).

Exit codes:
    0 — success (JSON on stdout)
    1 — error (JSON {"error": "..."} on stdout AND human message on stderr)
"""
import argparse
import json
import os
import sys
import time
import traceback

import requests

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {
    "User-Agent": _UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://trends.google.com/trends/",
}

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_COOKIES_FILE = os.path.join(_SCRIPT_DIR, "cookies.json")


def _load_cookies() -> dict:
    """Load browser cookies from cookies.json if present (Cookie-Editor export format)."""
    if not os.path.exists(_COOKIES_FILE):
        return {}
    try:
        with open(_COOKIES_FILE, encoding="utf-8") as f:
            data = json.load(f)
        # Cookie-Editor exports a list of {name, value, ...} objects
        if isinstance(data, list):
            return {c["name"]: c["value"] for c in data if "name" in c and "value" in c}
        # plain dict {name: value}
        if isinstance(data, dict):
            return data
    except Exception as e:
        sys.stderr.write(f"Warning: could not load {_COOKIES_FILE}: {e}\n")
    return {}


def _warm_session() -> dict:
    """Visit trends.google.com to acquire session cookies (fallback when no cookies.json)."""
    try:
        s = requests.Session()
        s.headers.update(_HEADERS)
        s.get("https://trends.google.com/trends/", timeout=10, allow_redirects=True)
        return dict(s.cookies)
    except Exception:
        return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyword", required=True)
    parser.add_argument("--geo", default="")
    parser.add_argument("--timeframe", default="today 5-y")
    args = parser.parse_args()

    try:
        from pytrends.request import TrendReq
    except ImportError as e:
        _emit_error(f"pytrends not installed: {e}")
        return 1

    cookies = _load_cookies()
    using_file_cookies = bool(cookies)

    if not using_file_cookies:
        cookies = _warm_session()
        time.sleep(2)

    delays = [3, 15, 45]
    last_err = None

    for attempt, pre_delay in enumerate(delays, start=1):
        try:
            pytrends = TrendReq(
                hl="en-US",
                tz=0,
                timeout=(10, 35),
                retries=0,
                requests_args={"headers": _HEADERS},
            )
            for k, v in cookies.items():
                pytrends.cookies[k] = v

            pytrends.build_payload(
                kw_list=[args.keyword],
                cat=0,
                timeframe=args.timeframe,
                geo=args.geo or "",
                gprop="",
            )
            time.sleep(pre_delay)
            df = pytrends.interest_over_time()
            last_err = None
            break
        except Exception as e:
            last_err = e
            msg = str(e)
            is_429 = "429" in msg or "too many" in msg.lower()
            if is_429 and attempt < len(delays):
                next_wait = delays[attempt] * 3
                sys.stderr.write(
                    f"[attempt {attempt}] 429 rate-limited, waiting {next_wait}s...\n"
                )
                sys.stderr.flush()
                time.sleep(next_wait)
                continue
            _emit_error(f"Google Trends request failed: {e}")
            traceback.print_exc(file=sys.stderr)
            return 1

    if last_err is not None:
        hint = (
            " Tip: export cookies from trends.google.com via Cookie-Editor "
            f"and save as {_COOKIES_FILE}"
        )
        _emit_error(
            f"Google Trends request failed after {len(delays)} attempts: {last_err}.{hint}"
        )
        return 1

    if df is None or df.empty:
        _emit_error(f"No data for keyword '{args.keyword}' in geo '{args.geo}'.")
        return 1

    if "isPartial" in df.columns:
        df = df[df["isPartial"] == False]  # noqa: E712

    series = df[args.keyword]
    points = [
        {"date": idx.strftime("%Y-%m-%d"), "value": float(val)}
        for idx, val in series.items()
    ]

    sys.stdout.write(json.dumps({
        "keyword": args.keyword,
        "geo": args.geo,
        "timeframe": args.timeframe,
        "points": points,
    }))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0


def _emit_error(msg: str) -> None:
    sys.stdout.write(json.dumps({"error": msg}))
    sys.stdout.write("\n")
    sys.stdout.flush()
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()


if __name__ == "__main__":
    sys.exit(main())
