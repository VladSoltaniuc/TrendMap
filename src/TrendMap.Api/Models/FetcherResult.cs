namespace TrendMap.Api.Models;

public record FetcherResult(
    string Keyword,
    string Geo,
    string Timeframe,
    IReadOnlyList<TrendPoint> Points,
    bool IsMock = false);
