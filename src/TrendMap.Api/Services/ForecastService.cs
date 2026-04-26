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

        var (alpha, beta) = OptimiseParams(values);

        // Holt's double exponential smoothing
        double level = values[0];
        double trend = (values[Math.Min(4, n - 1)] - values[0]) / Math.Min(4, n - 1);
        var errors = new List<double>(n - 1);

        for (int i = 1; i < n; i++)
        {
            double onestep = level + trend;
            errors.Add(values[i] - onestep);
            double prevLevel = level;
            level = alpha * values[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prevLevel) + (1 - beta) * trend;
        }

        // 95% prediction interval: ±1.96 * RMSE * sqrt(h)
        double rmse = Math.Sqrt(errors.Select(e => e * e).Average());

        var lastDate = historical[^1].Date;
        int stepDays = InferStepDays(historical);
        var result = new List<ForecastPoint>(horizon);
        for (int h = 1; h <= horizon; h++)
        {
            var date = lastDate.AddDays(stepDays * h);
            double value = Clamp(level + trend * h);
            double margin = 1.96 * rmse * Math.Sqrt(h);
            result.Add(new ForecastPoint(date, value, Clamp(value - margin), Clamp(value + margin)));
        }
        return result;
    }

    private static (double alpha, double beta) OptimiseParams(double[] values)
    {
        double bestAlpha = 0.3, bestBeta = 0.1, bestMse = double.MaxValue;
        foreach (var a in new[] { 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7 })
        foreach (var b in new[] { 0.05, 0.1, 0.15, 0.2, 0.3 })
        {
            double mse = ComputeMse(values, a, b);
            if (mse < bestMse) { bestMse = mse; bestAlpha = a; bestBeta = b; }
        }
        return (bestAlpha, bestBeta);
    }

    private static double ComputeMse(double[] values, double alpha, double beta)
    {
        double level = values[0];
        double trend = values.Length > 1 ? values[1] - values[0] : 0;
        double sumSq = 0;
        for (int i = 1; i < values.Length; i++)
        {
            double forecast = level + trend;
            sumSq += Math.Pow(values[i] - forecast, 2);
            double prevLevel = level;
            level = alpha * values[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prevLevel) + (1 - beta) * trend;
        }
        return sumSq / (values.Length - 1);
    }

    private static double Clamp(double v) => Math.Max(0, Math.Min(100, v));

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
