namespace TrendMap.Api.Models;

public record TrendResponse(
    string Keyword,
    string Geo,
    string Timeframe,
    IReadOnlyList<TrendPoint> Historical,
    IReadOnlyList<ForecastPoint> Forecast,
    bool FromCache,
    bool IsMock);
