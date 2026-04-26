using TrendMap.Api.Models;

namespace TrendMap.Api.Services;

public sealed class ForecastService
{
    private readonly ILogger<ForecastService> _log;

    public ForecastService(ILogger<ForecastService> log) => _log = log;

    public IReadOnlyList<ForecastPoint> Forecast(IReadOnlyList<TrendPoint> historical, int horizon)
    {
        if (historical.Count < 4)
        {
            _log.LogWarning("Too few points ({Count}) to forecast — returning empty.", historical.Count);
            return Array.Empty<ForecastPoint>();
        }

        var values = historical.Select(p => p.Value).ToArray();
        int n = values.Length;
        int stepDays = InferStepDays(historical);

        // Annual seasonal period: 52 for weekly data, 12 for monthly
        int m = stepDays <= 10 ? 52 : stepDays <= 45 ? 12 : 0;

        double[] raw = m > 0 && n >= m
            ? SeasonalHoltForecast(values, m, horizon)
            : HoltForecast(values, horizon);

        var lastDate = historical[^1].Date;
        var result = new List<ForecastPoint>(horizon);
        for (int h = 0; h < horizon; h++)
            result.Add(new ForecastPoint(lastDate.AddDays(stepDays * (h + 1)), Clamp(raw[h])));
        return result;
    }

    // Multiplicative seasonal decomposition + Holt's on deseasonalized series.
    private static double[] SeasonalHoltForecast(double[] values, int m, int horizon)
    {
        int n = values.Length;

        // Seasonal indices: average ratio of each slot to the overall mean
        double mean = values.Average();
        if (mean < 1e-6) mean = 1;
        var siSum = new double[m];
        var siCount = new int[m];
        for (int i = 0; i < n; i++)
        {
            siSum[i % m] += values[i] / mean;
            siCount[i % m]++;
        }
        var si = new double[m];
        for (int s = 0; s < m; s++)
            si[s] = siCount[s] > 0 ? siSum[s] / siCount[s] : 1.0;

        // Deseasonalize
        var ds = new double[n];
        for (int i = 0; i < n; i++)
            ds[i] = si[i % m] > 0.01 ? values[i] / si[i % m] : values[i];

        // Holt's on deseasonalized series
        var (alpha, beta) = OptimiseParams(ds);
        double level = ds[0];
        double trend = (ds[Math.Min(4, n - 1)] - ds[0]) / Math.Min(4, n - 1);
        for (int i = 1; i < n; i++)
        {
            double prev = level;
            level = alpha * ds[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prev) + (1 - beta) * trend;
        }

        // Reapply seasonal indices with damped trend (phi=0.85 prevents amplification blow-up)
        const double phi = 0.85;
        var result = new double[horizon];
        double dampSum = 0, phiPow = phi;
        for (int h = 1; h <= horizon; h++)
        {
            dampSum += phiPow;
            phiPow *= phi;
            result[h - 1] = (level + dampSum * trend) * si[(n + h - 1) % m];
        }
        return result;
    }

    private static double[] HoltForecast(double[] values, int horizon)
    {
        int n = values.Length;
        var (alpha, beta) = OptimiseParams(values);
        double level = values[0];
        double trend = (values[Math.Min(4, n - 1)] - values[0]) / Math.Min(4, n - 1);
        for (int i = 1; i < n; i++)
        {
            double prev = level;
            level = alpha * values[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prev) + (1 - beta) * trend;
        }
        const double phi = 0.85;
        var result = new double[horizon];
        double dampSum = 0, phiPow = phi;
        for (int h = 1; h <= horizon; h++)
        {
            dampSum += phiPow;
            phiPow *= phi;
            result[h - 1] = level + dampSum * trend;
        }
        return result;
    }

    private static (double alpha, double beta) OptimiseParams(double[] values)
    {
        double bestA = 0.3, bestB = 0.1, bestMse = double.MaxValue;
        foreach (var a in new[] { 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7 })
        foreach (var b in new[] { 0.05, 0.1, 0.15, 0.2, 0.3 })
        {
            double mse = ComputeMse(values, a, b);
            if (mse < bestMse) { bestMse = mse; bestA = a; bestB = b; }
        }
        return (bestA, bestB);
    }

    private static double ComputeMse(double[] values, double alpha, double beta)
    {
        double level = values[0];
        double trend = values.Length > 1 ? values[1] - values[0] : 0;
        double sumSq = 0;
        for (int i = 1; i < values.Length; i++)
        {
            double f = level + trend;
            sumSq += Math.Pow(values[i] - f, 2);
            double prev = level;
            level = alpha * values[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prev) + (1 - beta) * trend;
        }
        return sumSq / (values.Length - 1);
    }

    private static double Clamp(double v) => Math.Max(0, v);

    private static int InferStepDays(IReadOnlyList<TrendPoint> points)
    {
        if (points.Count < 2) return 7;
        var diffs = Enumerable.Range(1, points.Count - 1)
            .Select(i => points[i].Date.DayNumber - points[i - 1].Date.DayNumber)
            .OrderBy(x => x)
            .ToList();
        return diffs[diffs.Count / 2];
    }
}
