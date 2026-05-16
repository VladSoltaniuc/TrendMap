namespace TrendMap.Api.Services;

internal static class ForecastConstants
{
    // Damping factor for the trend component. Values < 1 prevent indefinite growth
    // of the forecast trend over long horizons. 0.85 is a textbook default.
    public const double DampingPhi = 0.85;

    // Annual seasonal periods inferred from sampling cadence.
    public const int WeeklySeasonalPeriod = 52;
    public const int MonthlySeasonalPeriod = 12;

    // Thresholds (in days) for classifying sampling cadence.
    public const int WeeklyMaxStepDays = 10;
    public const int MonthlyMaxStepDays = 45;

    // Minimum sample count required before forecasting is attempted.
    public const int MinHistoricalPoints = 4;

    // Default fallback step (days) used to space synthetic forecast dates when the
    // historical series is too short to infer cadence.
    public const int FallbackStepDays = 7;

    // Default forecast horizon when cadence cannot be inferred (~12 months of weekly samples).
    public const int DefaultHorizon = 12;

    // Grid search ranges for Holt's smoothing parameters.
    public static readonly double[] AlphaCandidates = { 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7 };
    public static readonly double[] BetaCandidates = { 0.05, 0.1, 0.15, 0.2, 0.3 };
}
