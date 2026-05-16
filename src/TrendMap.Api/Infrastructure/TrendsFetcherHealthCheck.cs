using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using TrendMap.Api.Configuration;

namespace TrendMap.Api.Infrastructure;

public sealed class TrendsFetcherHealthCheck : IHealthCheck
{
    private readonly string _scriptPath;
    private readonly string _node;

    public TrendsFetcherHealthCheck(IOptions<TrendsOptions> options, IWebHostEnvironment env)
    {
        _node = NodePathResolver.Resolve(options.Value.NodeExecutable);
        _scriptPath = Path.Combine(env.ContentRootPath, "scripts", "fetch_trends.js");
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_scriptPath))
            return Task.FromResult(HealthCheckResult.Unhealthy(
                $"Fetch script missing at {_scriptPath}"));

        var data = new Dictionary<string, object>
        {
            ["node"] = _node,
            ["script"] = _scriptPath,
        };
        return Task.FromResult(HealthCheckResult.Healthy("trends fetcher ready", data));
    }
}
