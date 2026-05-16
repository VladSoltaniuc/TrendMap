using TrendMap.Api.Models;
using static TrendMap.Api.Services.ForecastConstants;

namespace TrendMap.Api.Services;

public sealed class ForecastService
{
    private readonly ILogger<ForecastService> _log;

    public ForecastService(ILogger<ForecastService> log) => _log = log;

    public IReadOnlyList<ForecastPoint> Forecast(IReadOnlyList<TrendPoint> historical, int horizon)
    {
        if (historical.Count < MinHistoricalPoints)
        {
            _log.LogWarning(
                "Too few points ({Count}) to forecast — returning empty.", historical.Count);
            return Array.Empty<ForecastPoint>();
        }

        var values = historical.Select(p => p.Value).ToArray();
        int n = values.Length;
        int stepDays = InferStepDays(historical);

        int seasonalPeriod = stepDays <= WeeklyMaxStepDays
            ? WeeklySeasonalPeriod
            : stepDays <= MonthlyMaxStepDays ? MonthlySeasonalPeriod : 0;

        double[] raw = seasonalPeriod > 0 && n >= seasonalPeriod
            ? SeasonalHoltForecast(values, seasonalPeriod, horizon)
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

        var si = ComputeSeasonalIndices(values, m);
        var ds = Deseasonalize(values, si, m);

        var (level, trend) = FitHolt(ds);

        var result = new double[horizon];
        double dampSum = 0, phiPow = DampingPhi;
        for (int h = 1; h <= horizon; h++)
        {
            dampSum += phiPow;
            phiPow *= DampingPhi;
            result[h - 1] = (level + dampSum * trend) * si[(n + h - 1) % m];
        }
        return result;
    }

    private static double[] HoltForecast(double[] values, int horizon)
    {
        var (level, trend) = FitHolt(values);
        var result = new double[horizon];
        double dampSum = 0, phiPow = DampingPhi;
        for (int h = 1; h <= horizon; h++)
        {
            dampSum += phiPow;
            phiPow *= DampingPhi;
            result[h - 1] = level + dampSum * trend;
        }
        return result;
    }

    private static (double level, double trend) FitHolt(double[] values)
    {
        int n = values.Length;
        var (alpha, beta) = OptimiseParams(values);
        double level = values[0];
        int seedIndex = Math.Min(MinHistoricalPoints, n - 1);
        double trend = (values[seedIndex] - values[0]) / seedIndex;
        for (int i = 1; i < n; i++)
        {
            double prev = level;
            level = alpha * values[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prev) + (1 - beta) * trend;
        }
        return (level, trend);
    }

    private static double[] ComputeSeasonalIndices(double[] values, int m)
    {
        int n = values.Length;
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
        return si;
    }

    private static double[] Deseasonalize(double[] values, double[] si, int m)
    {
        int n = values.Length;
        var ds = new double[n];
        for (int i = 0; i < n; i++)
            ds[i] = si[i % m] > 0.01 ? values[i] / si[i % m] : values[i];
        return ds;
    }

    private static (double alpha, double beta) OptimiseParams(double[] values)
    {
        double bestA = 0.3, bestB = 0.1, bestMse = double.MaxValue;
        foreach (var a in AlphaCandidates)
        foreach (var b in BetaCandidates)
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
        if (points.Count < 2) return FallbackStepDays;
        var diffs = Enumerable.Range(1, points.Count - 1)
            .Select(i => points[i].Date.DayNumber - points[i - 1].Date.DayNumber)
            .OrderBy(x => x)
            .ToList();
        return diffs[diffs.Count / 2];
    }
}
