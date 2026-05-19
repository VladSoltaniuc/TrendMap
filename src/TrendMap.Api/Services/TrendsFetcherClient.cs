using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TrendMap.Api.Configuration;
using TrendMap.Api.Errors;
using TrendMap.Api.Infrastructure;
using TrendMap.Api.Models;

namespace TrendMap.Api.Services;

public interface ITrendsFetcherClient
{
    Task<FetcherResult> FetchAsync(string keyword, string geo, string timeframe, CancellationToken ct);
}

public sealed class TrendsFetcherClient : ITrendsFetcherClient
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    private readonly ILogger<TrendsFetcherClient> _log;
    private readonly string _node;
    private readonly string _scriptPath;
    private readonly TimeSpan _fetchTimeout;
    private readonly string? _nodeOptions;

    public TrendsFetcherClient(
        IOptions<TrendsOptions> options,
        ILogger<TrendsFetcherClient> log,
        IWebHostEnvironment env)
    {
        var opts = options.Value;
        _log = log;
        _node = NodePathResolver.Resolve(opts.NodeExecutable);
        _scriptPath = Path.Combine(env.ContentRootPath, "scripts", "fetch_trends.js");
        _fetchTimeout = TimeSpan.FromSeconds(opts.FetchTimeoutSeconds);
        _nodeOptions = string.IsNullOrWhiteSpace(opts.NodeOptions) ? null : opts.NodeOptions;
        _log.LogInformation("Node interpreter resolved to: {Node}", _node);
        _log.LogInformation("Trends fetch script path: {Script}", _scriptPath);
        if (_nodeOptions is not null)
            _log.LogInformation("NODE_OPTIONS: {Options}", _nodeOptions);
    }

    public async Task<FetcherResult> FetchAsync(string keyword, string geo, string timeframe, CancellationToken ct)
    {
        if (!File.Exists(_scriptPath))
            throw new UpstreamException($"Trends fetch script not found at {_scriptPath}");

        try
        {
            return await FetchOnceAsync(keyword, geo, timeframe, mock: false, ct);
        }
        catch (UpstreamException ex) when (IsRateLimit(ex))
        {
            _log.LogWarning(
                "Upstream rate-limited for {Keyword}/{Geo} — falling back to mock data.",
                keyword, geo);
            return await FetchOnceAsync(keyword, geo, timeframe, mock: true, ct);
        }
    }

    private async Task<FetcherResult> FetchOnceAsync(
        string keyword, string geo, string timeframe, bool mock, CancellationToken ct)
    {
        var (exitCode, stdout, stderr) = await RunScriptAsync(keyword, geo, timeframe, mock, ct);

        // Upstream "no data" is a stable, cacheable outcome — not an error.
        if (exitCode != 0 && stderr.StartsWith("No data for keyword", StringComparison.OrdinalIgnoreCase))
        {
            _log.LogInformation(
                "Upstream reports no data for {Keyword}/{Geo}/{Timeframe} — returning empty result.",
                keyword, geo, timeframe);
            return new FetcherResult(keyword, geo, timeframe, Array.Empty<TrendPoint>(), IsMock: mock);
        }

        ThrowForScriptError(exitCode, stdout, stderr);
        return ParseResult(keyword, geo, timeframe, stdout, stderr, isMock: mock);
    }

    private static bool IsRateLimit(Exception ex)
    {
        var msg = ex.Message;
        return msg.Contains("429")
               || msg.Contains("rate", StringComparison.OrdinalIgnoreCase)
               || msg.Contains("Too Many", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<(int ExitCode, string Stdout, string Stderr)> RunScriptAsync(
        string keyword, string geo, string timeframe, bool mock, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = _node,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        if (_nodeOptions is not null)
            psi.Environment["NODE_OPTIONS"] = _nodeOptions;
        psi.ArgumentList.Add(_scriptPath);
        psi.ArgumentList.Add("--keyword"); psi.ArgumentList.Add(keyword);
        psi.ArgumentList.Add("--geo"); psi.ArgumentList.Add(geo);
        psi.ArgumentList.Add("--timeframe"); psi.ArgumentList.Add(timeframe);
        if (mock) psi.ArgumentList.Add("--mock");

        using var proc = new Process { StartInfo = psi };
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        proc.OutputDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
        proc.ErrorDataReceived += (_, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };

        proc.Start();
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(_fetchTimeout);
        try
        {
            await proc.WaitForExitAsync(timeoutCts.Token);
        }
        catch (OperationCanceledException)
        {
            try { proc.Kill(true); }
            catch (Exception ex) { _log.LogWarning(ex, "Failed to kill timed-out trends process."); }
            throw new UpstreamTimeoutException(
                $"Trends fetch timed out after {_fetchTimeout.TotalSeconds:0}s.");
        }

        return (proc.ExitCode, stdout.ToString().Trim(), stderr.ToString().Trim());
    }

    private void ThrowForScriptError(int exitCode, string stdout, string stderr)
    {
        if (exitCode != 0)
        {
            _log.LogWarning("Trends script failed: {Err}", stderr);
            if (stderr.StartsWith("No data for keyword", StringComparison.OrdinalIgnoreCase))
                throw new InvalidRequestException(stderr);
            throw new UpstreamException($"Trends fetch failed: {stderr}");
        }

        if (string.IsNullOrEmpty(stdout))
            throw new UpstreamException(
                string.IsNullOrEmpty(stderr) ? "No output from trends script." : $"Trends error: {stderr}");
    }

    private FetcherResult ParseResult(string keyword, string geo, string timeframe,
        string stdout, string stderr, bool isMock)
    {
        TrendsDto dto;
        try
        {
            dto = JsonSerializer.Deserialize<TrendsDto>(stdout, JsonOpts)
                  ?? throw new UpstreamException("Empty response from trends script.");
        }
        catch (JsonException ex)
        {
            _log.LogError(ex, "Failed to parse trends output. stdout={Json} stderr={Err}", stdout, stderr);
            throw new UpstreamException($"Invalid JSON from trends script: {ex.Message}", ex);
        }

        if (dto.Error is not null)
            throw new UpstreamException(dto.Error);

        var points = dto.Points!
            .Select(p => new TrendPoint(DateOnly.Parse(p.Date, CultureInfo.InvariantCulture), p.Value))
            .OrderBy(p => p.Date)
            .ToList();

        // An empty `points` array is a normal (cacheable) outcome: the keyword exists
        // upstream but had no search volume in the requested window.
        return new FetcherResult(keyword, geo, timeframe, points, isMock);
    }

    private sealed class TrendsDto
    {
        public string? Error { get; set; }
        public List<PointDto>? Points { get; set; }
    }

    private sealed class PointDto
    {
        public string Date { get; set; } = "";
        public double Value { get; set; }
    }
}
