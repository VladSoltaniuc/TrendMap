using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using TrendMap.Api.Configuration;
using TrendMap.Api.Models;
using TrendMap.Api.Validation;

namespace TrendMap.Api.Services;

public interface ITrendsService
{
    Task<TrendResponse> GetAsync(TrendRequest req, CancellationToken ct);
}

public sealed class TrendsService : ITrendsService
{
    private readonly ITrendRequestValidator _validator;
    private readonly ITrendsFetcherClient _client;
    private readonly ForecastService _forecaster;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _cacheTtl;
    private readonly ILogger<TrendsService> _log;

    public TrendsService(
        ITrendRequestValidator validator,
        ITrendsFetcherClient client,
        ForecastService forecaster,
        IMemoryCache cache,
        IOptions<TrendsOptions> options,
        ILogger<TrendsService> log)
    {
        _validator = validator;
        _client = client;
        _forecaster = forecaster;
        _cache = cache;
        _cacheTtl = TimeSpan.FromMinutes(options.Value.CacheMinutes);
        _log = log;
    }

    public async Task<TrendResponse> GetAsync(TrendRequest req, CancellationToken ct)
    {
        var normalized = _validator.Validate(req);
        var cacheKey = BuildCacheKey(normalized);

        if (_cache.TryGetValue<TrendResponse>(cacheKey, out var cached) && cached is not null)
        {
            _log.LogInformation(
                "Cache hit for {Keyword}/{Geo}/{Timeframe}",
                normalized.Keyword, normalized.Geo, normalized.Timeframe);
            return cached with { FromCache = true };
        }

        _log.LogInformation(
            "Cache miss — fetching {Keyword}/{Geo}/{Timeframe}",
            normalized.Keyword, normalized.Geo, normalized.Timeframe);

        var raw = await _client.FetchAsync(normalized.Keyword, normalized.Geo, normalized.Timeframe, ct);
        var forecast = _forecaster.Forecast(raw.Points, ComputeHorizon(raw.Points));

        var response = new TrendResponse(
            Keyword: raw.Keyword,
            Geo: raw.Geo,
            Timeframe: raw.Timeframe,
            Historical: raw.Points,
            Forecast: forecast,
            FromCache: false,
            IsMock: raw.IsMock);

        // Don't cache mock data — real data may become available on the next request.
        if (!raw.IsMock)
            _cache.Set(cacheKey, response, _cacheTtl);

        return response;
    }

    private static string BuildCacheKey(NormalizedTrendRequest r) =>
        $"trend::{r.Keyword}::{r.Geo}::{r.Timeframe}";

    private static int ComputeHorizon(IReadOnlyList<TrendPoint> points)
    {
        if (points.Count < 2) return 12;
        var stepDays = points[1].Date.DayNumber - points[0].Date.DayNumber;
        return Math.Max(4, 365 / Math.Max(stepDays, 1));
    }
}
