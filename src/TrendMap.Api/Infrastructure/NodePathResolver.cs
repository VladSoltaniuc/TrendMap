namespace TrendMap.Api.Infrastructure;

public static class NodePathResolver
{
    /// <summary>
    /// Resolves a Node interpreter path. If <paramref name="configured"/> is an absolute or relative
    /// path it is returned as-is; otherwise the executable is looked up on PATH (skipping the
    /// WindowsApps shim that surfaces an interactive store prompt).
    /// </summary>
    public static string Resolve(string? configured)
    {
        if (!string.IsNullOrWhiteSpace(configured) &&
            (Path.IsPathRooted(configured) || configured.Contains('/') || configured.Contains('\\')))
            return configured;

        var name = string.IsNullOrWhiteSpace(configured) ? "node" : configured;
        if (!OperatingSystem.IsWindows()) return name;

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        var exts = (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE").Split(';');
        foreach (var dir in pathEnv.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            // WindowsApps contains an interactive Microsoft Store stub for missing executables.
            if (dir.Contains("WindowsApps", StringComparison.OrdinalIgnoreCase)) continue;
            foreach (var ext in exts)
            {
                var candidate = Path.Combine(dir.Trim(), name + ext);
                if (File.Exists(candidate)) return candidate;
            }
        }
        return name;
    }
}
