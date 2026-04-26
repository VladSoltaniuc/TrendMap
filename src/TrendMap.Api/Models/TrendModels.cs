namespace TrendMap.Api.Models;

public record TrendRequest(string Keyword, string Geo, string? Timeframe);

public record TrendPoint(DateOnly Date, double Value);

public record ForecastPoint(DateOnly Date, double Value);

public record TrendResponse(
    string Keyword,
    string Geo,
    string Timeframe,
    IReadOnlyList<TrendPoint> Historical,
    IReadOnlyList<ForecastPoint> Forecast,
    bool FromCache);

public record PyTrendsResult(
    string Keyword,
    string Geo,
    string Timeframe,
    IReadOnlyList<TrendPoint> Points);
