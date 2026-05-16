using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using TrendMap.Api.Configuration;
using TrendMap.Api.Errors;
using TrendMap.Api.Models;

namespace TrendMap.Api.Validation;

public interface ITrendRequestValidator
{
    NormalizedTrendRequest Validate(TrendRequest req);
}

public sealed record NormalizedTrendRequest(string Keyword, string Geo, string Timeframe);

public sealed class TrendRequestValidator : ITrendRequestValidator
{
    // ISO country/region codes: "US", "GB", "US-NY", "RO", etc.
    private static readonly Regex GeoPattern =
        new(@"^[A-Z]{2}(-[A-Z0-9]{1,3})?$", RegexOptions.Compiled);

    // Whitelisted upstream timeframe formats
    private static readonly Regex TimeframePattern =
        new(@"^(today \d{1,2}-[ymYM]|now \d{1,2}-[dDhH]|\d{4}-\d{2}-\d{2} \d{4}-\d{2}-\d{2})$",
            RegexOptions.Compiled);

    private const int MaxKeywordLength = 200;

    private readonly TrendsOptions _options;

    public TrendRequestValidator(IOptions<TrendsOptions> options) => _options = options.Value;

    public NormalizedTrendRequest Validate(TrendRequest req)
    {
        var keyword = StripControl(req.Keyword?.Trim() ?? "");
        var geo = StripControl((req.Geo ?? "").Trim().ToUpperInvariant());
        var timeframe = string.IsNullOrWhiteSpace(req.Timeframe)
            ? _options.DefaultTimeframe
            : StripControl(req.Timeframe.Trim());

        if (string.IsNullOrWhiteSpace(keyword))
            throw new InvalidRequestException("Keyword is required.");

        if (keyword.Length > MaxKeywordLength)
            throw new InvalidRequestException($"Keyword must be {MaxKeywordLength} characters or fewer.");

        if (geo.Length > 0 && !GeoPattern.IsMatch(geo))
            throw new InvalidRequestException(
                "Invalid geo code. Expected an ISO country code such as 'US' or 'US-NY'.");

        if (!TimeframePattern.IsMatch(timeframe))
            throw new InvalidRequestException(
                "Invalid timeframe. Use formats like 'today 5-y', 'now 7-d', or 'YYYY-MM-DD YYYY-MM-DD'.");

        // Explicit date-range branch starts with a digit; relative branches start with a letter.
        // The regex only checks shape — verify calendar validity and ordering here.
        if (char.IsDigit(timeframe[0]))
            ValidateDateRange(timeframe);

        return new NormalizedTrendRequest(keyword, geo, timeframe);
    }

    private static void ValidateDateRange(string timeframe)
    {
        var parts = timeframe.Split(' ');
        if (!DateOnly.TryParseExact(parts[0], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) ||
            !DateOnly.TryParseExact(parts[1], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end))
            throw new InvalidRequestException(
                "Invalid date in timeframe. Use 'YYYY-MM-DD YYYY-MM-DD' with calendar-valid dates.");

        if (end < start)
            throw new InvalidRequestException("Timeframe end date must be on or after start date.");
    }

    private static string StripControl(string s) =>
        s.Any(char.IsControl) ? new string(s.Where(c => !char.IsControl(c)).ToArray()) : s;
}
