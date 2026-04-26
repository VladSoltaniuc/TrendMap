using System.Diagnostics;
using System.Text;
using System.Text.Json;
using TrendMap.Api.Models;

namespace TrendMap.Api.Services;

public interface ITrendsClient
{
    Task<PyTrendsResult> FetchAsync(string keyword, string geo, string timeframe, CancellationToken ct);
}

public sealed class PyTrendsClient : ITrendsClient
{
    private readonly ILogger<PyTrendsClient> _log;
    private readonly string _python;
    private readonly string _scriptPath;

    public PyTrendsClient(IConfiguration config, ILogger<PyTrendsClient> log, IWebHostEnvironment env)
    {
        _log = log;
        var configured = config["Trends:PythonExecutable"];
        _python = ResolvePython(configured);
        _scriptPath = Path.Combine(env.ContentRootPath, "scripts", "fetch_trends.py");
        _log.LogInformation("Using Python interpreter: {Python}", _python);
        _log.LogInformation("Trends script path: {Script}", _scriptPath);
    }

    /// <summary>
    /// Resolve the Python interpreter, skipping the Windows "App execution alias"
    /// stub at WindowsApps\python.exe (which opens the Store and blocks forever).
    /// </summary>
    private static string ResolvePython(string? configured)
    {
        if (!string.IsNullOrWhiteSpace(configured) && (Path.IsPathRooted(configured) || configured.Contains('/') || configured.Contains('\\')))
            return configured;

        var name = string.IsNullOrWhiteSpace(configured) ? "python" : configured;
        if (!OperatingSystem.IsWindows())
            return name;

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        var exts = (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE").Split(';');
        foreach (var dir in pathEnv.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            if (dir.Contains("WindowsApps", StringComparison.OrdinalIgnoreCase))
                continue;
            foreach (var ext in exts)
            {
                var candidate = Path.Combine(dir.Trim(), name + ext);
                if (File.Exists(candidate))
                    return candidate;
            }
            var bare = Path.Combine(dir.Trim(), name);
            if (File.Exists(bare))
                return bare;
        }
        return name; // fall through — let the OS try
    }

    public async Task<PyTrendsResult> FetchAsync(string keyword, string geo, string timeframe, CancellationToken ct)
    {
        if (!File.Exists(_scriptPath))
            throw new InvalidOperationException($"Python script not found at {_scriptPath}");

        var psi = new ProcessStartInfo
        {
            FileName = _python,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add("-u"); // unbuffered stdout/stderr
        psi.ArgumentList.Add(_scriptPath);
        psi.ArgumentList.Add("--keyword");
        psi.ArgumentList.Add(keyword);
        psi.ArgumentList.Add("--geo");
        psi.ArgumentList.Add(geo);
        psi.ArgumentList.Add("--timeframe");
        psi.ArgumentList.Add(timeframe);

        using var proc = new Process { StartInfo = psi };
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        proc.OutputDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
        proc.ErrorDataReceived += (_, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };

        proc.Start();
        proc.BeginOutputReadLine();
        proc.BeginErrorReadLine();

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(45));

        try
        {
            await proc.WaitForExitAsync(timeoutCts.Token);
        }
        catch (OperationCanceledException)
        {
            try { proc.Kill(true); } catch { }
            throw new TimeoutException("Google Trends fetch timed out (45s).");
        }

        if (proc.ExitCode != 0)
        {
            var err = stderr.ToString().Trim();
            _log.LogWarning("pytrends script failed: {Err}", err);
            throw new InvalidOperationException($"Trends fetch failed: {err}");
        }

        var json = stdout.ToString().Trim();
        if (string.IsNullOrEmpty(json))
        {
            var err = stderr.ToString().Trim();
            throw new InvalidOperationException(
                string.IsNullOrEmpty(err) ? "No output from pytrends script." : $"pytrends error: {err}");
        }

        PyTrendsDto dto;
        try
        {
            dto = JsonSerializer.Deserialize<PyTrendsDto>(json, JsonOpts)
                  ?? throw new InvalidOperationException("Empty response from pytrends script.");
        }
        catch (JsonException ex)
        {
            _log.LogError("Failed to parse pytrends output. stdout={Json} stderr={Err}", json, stderr.ToString());
            throw new InvalidOperationException($"Invalid JSON from pytrends script: {ex.Message}");
        }

        if (dto.Error is not null)
            throw new InvalidOperationException(dto.Error);

        var points = dto.Points!
            .Select(p => new TrendPoint(DateOnly.Parse(p.Date), p.Value))
            .OrderBy(p => p.Date)
            .ToList();

        if (points.Count == 0)
            throw new InvalidOperationException($"No trends data returned for '{keyword}' in '{geo}'.");

        return new PyTrendsResult(keyword, geo, timeframe, points);
    }

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    private sealed class PyTrendsDto
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
