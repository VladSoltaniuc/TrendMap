using System.ComponentModel.DataAnnotations;

namespace TrendMap.Api.Configuration;

public sealed class TrendsOptions
{
    public const string SectionName = "Trends";

    [Required]
    public string NodeExecutable { get; set; } = "node";

    [Range(1, 1440)]
    public int CacheMinutes { get; set; } = 60;

    [Required, MinLength(1)]
    public string DefaultTimeframe { get; set; } = "today 5-y";

    [Range(5, 300)]
    public int FetchTimeoutSeconds { get; set; } = 45;

    [Range(1, 1000)]
    public int RateLimitPerMinute { get; set; } = 30;

    public string[]? AllowedOrigins { get; set; }

    /// <summary>
    /// Additional <c>NODE_OPTIONS</c> passed to the fetch subprocess. Defaults to
    /// <c>--use-system-ca</c> so Node (22+) trusts the OS certificate store —
    /// required behind TLS-inspecting proxies whose root CA is in the system store.
    /// </summary>
    public string NodeOptions { get; set; } = "--use-system-ca";
}
