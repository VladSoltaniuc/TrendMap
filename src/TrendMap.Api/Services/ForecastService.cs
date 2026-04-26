using Microsoft.ML;
using Microsoft.ML.Transforms.TimeSeries;
using TrendMap.Api.Models;

namespace TrendMap.Api.Services;

public sealed class ForecastService
{
    private readonly ILogger<ForecastService> _log;

    public ForecastService(ILogger<ForecastService> log) => _log = log;

    public IReadOnlyList<ForecastPoint> Forecast(IReadOnlyList<TrendPoint> historical, int horizon)
    {
        if (historical.Count < 8)
        {
            _log.LogWarning("Too few points ({Count}) to forecast — returning empty.", historical.Count);
            return Array.Empty<ForecastPoint>();
        }

        var ml = new MLContext(seed: 1);
        var data = historical
            .Select(p => new TsRow { Value = (float)p.Value })
            .ToList();
        var view = ml.Data.LoadFromEnumerable(data);

        var seriesLength = historical.Count;
        var windowSize = Math.Min(Math.Max(seriesLength / 4, 4), 52);
        var trainSize = seriesLength;

        var pipeline = ml.Forecasting.ForecastBySsa(
            outputColumnName: nameof(TsForecast.Forecast),
            inputColumnName: nameof(TsRow.Value),
            windowSize: windowSize,
            seriesLength: seriesLength,
            trainSize: trainSize,
            horizon: horizon,
            confidenceLevel: 0.95f,
            confidenceLowerBoundColumn: nameof(TsForecast.LowerBound),
            confidenceUpperBoundColumn: nameof(TsForecast.UpperBound));

        var model = pipeline.Fit(view);
        var engine = model.CreateTimeSeriesEngine<TsRow, TsForecast>(ml);
        var prediction = engine.Predict();

        var lastDate = historical[^1].Date;
        var stepDays = InferStepDays(historical);

        var result = new List<ForecastPoint>(horizon);
        for (var i = 0; i < horizon; i++)
        {
            var date = lastDate.AddDays(stepDays * (i + 1));
            var value = Clamp(prediction.Forecast[i]);
            var lower = Clamp(prediction.LowerBound[i]);
            var upper = Clamp(prediction.UpperBound[i]);
            result.Add(new ForecastPoint(date, value, lower, upper));
        }
        return result;
    }

    private static double Clamp(float v) => Math.Max(0, Math.Min(100, v));

    private static int InferStepDays(IReadOnlyList<TrendPoint> points)
    {
        if (points.Count < 2) return 7;
        var diffs = new List<int>();
        for (var i = 1; i < points.Count; i++)
            diffs.Add(points[i].Date.DayNumber - points[i - 1].Date.DayNumber);
        diffs.Sort();
        return diffs[diffs.Count / 2];
    }

    private sealed class TsRow
    {
        public float Value { get; set; }
    }

    private sealed class TsForecast
    {
        public float[] Forecast { get; set; } = Array.Empty<float>();
        public float[] LowerBound { get; set; } = Array.Empty<float>();
        public float[] UpperBound { get; set; } = Array.Empty<float>();
    }
}
