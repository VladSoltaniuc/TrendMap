using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using TrendMap.Api.Models;

namespace TrendMap.Api.Services;

public sealed class TrendsService
{
    private readonly ITrendsClient _client;
    private readonly ForecastService _forecaster;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _cacheTtl;

    // ISO country/region codes: "US", "GB", "US-NY", "RO", etc.
    private static readonly Regex GeoPattern =
        new(@"^[A-Z]{2}(-[A-Z0-9]{1,3})?$", RegexOptions.Compiled);

    // Whitelisted pytrends timeframe formats
    private static readonly Regex TimeframePattern =
        new(@"^(today \d{1,2}-[ymYM]|now \d{1,2}-[dDhH]|\d{4}-\d{2}-\d{2} \d{4}-\d{2}-\d{2})$",
            RegexOptions.Compiled);

    public TrendsService(ITrendsClient client, ForecastService forecaster, IMemoryCache cache, IConfiguration config)
    {
        _client = client;
        _forecaster = forecaster;
        _cache = cache;
        var minutes = config.GetValue<int?>("Trends:CacheMinutes") ?? 60;
        _cacheTtl = TimeSpan.FromMinutes(minutes);
    }

    public async Task<TrendResponse> GetAsync(TrendRequest req, CancellationToken ct)
    {
        var keyword = StripControl(req.Keyword.Trim());
        var geo = StripControl((req.Geo ?? "").Trim().ToUpperInvariant());
        var timeframe = string.IsNullOrWhiteSpace(req.Timeframe) ? "today 5-y" : StripControl(req.Timeframe.Trim());

        if (string.IsNullOrWhiteSpace(keyword))
            throw new ArgumentException("Keyword is required.");

        if (keyword.Length > 200)
            throw new ArgumentException("Keyword must be 200 characters or fewer.");

        if (geo.Length > 0 && !GeoPattern.IsMatch(geo))
            throw new ArgumentException("Invalid geo code. Expected an ISO country code such as 'US' or 'US-NY'.");

        if (!TimeframePattern.IsMatch(timeframe))
            throw new ArgumentException("Invalid timeframe. Use formats like 'today 5-y', 'now 7-d', or 'YYYY-MM-DD YYYY-MM-DD'.");

        var cacheKey = $"trend::{keyword}::{geo}::{timeframe}";
        if (_cache.TryGetValue<TrendResponse>(cacheKey, out var cached) && cached is not null)
            return cached with { FromCache = true };

        var raw = await _client.FetchAsync(keyword, geo, timeframe, ct);
        var horizon = ComputeHorizon(raw.Points);
        var forecast = _forecaster.Forecast(raw.Points, horizon);

        var response = new TrendResponse(
            Keyword: raw.Keyword,
            Geo: raw.Geo,
            Timeframe: raw.Timeframe,
            Historical: raw.Points,
            Forecast: forecast,
            FromCache: false);

        _cache.Set(cacheKey, response, _cacheTtl);
        return response;
    }

    private static int ComputeHorizon(IReadOnlyList<TrendPoint> points)
    {
        if (points.Count < 2) return 12;
        var stepDays = points[1].Date.DayNumber - points[0].Date.DayNumber;
        // 12 months ≈ 365 days
        return Math.Max(4, 365 / Math.Max(stepDays, 1));
    }

    private static string StripControl(string s) =>
        s.Any(char.IsControl) ? new string(s.Where(c => !char.IsControl(c)).ToArray()) : s;
}
