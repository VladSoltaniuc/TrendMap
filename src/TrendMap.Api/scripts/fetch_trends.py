"""Fetch Google Trends interest-over-time for a keyword and emit JSON to stdout.

Invoked by the .NET API as:
    python fetch_trends.py --keyword "bitcoin" --geo "US" --timeframe "today 5-y"

Exit codes:
    0 — success (JSON on stdout)
    1 — error (JSON {"error": "..."} on stdout AND human message on stderr)
"""
import argparse
import json
import sys
import traceback


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

    try:
        pytrends = TrendReq(hl="en-US", tz=0, timeout=(10, 25), retries=2, backoff_factor=0.3)
        pytrends.build_payload(
            kw_list=[args.keyword],
            cat=0,
            timeframe=args.timeframe,
            geo=args.geo or "",
            gprop="",
        )
        df = pytrends.interest_over_time()
    except Exception as e:
        _emit_error(f"Google Trends request failed: {e}")
        traceback.print_exc(file=sys.stderr)
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
