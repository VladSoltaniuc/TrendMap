using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using TrendMap.Api.Configuration;
using TrendMap.Api.Infrastructure;
using TrendMap.Api.Services;
using TrendMap.Api.Validation;

var builder = WebApplication.CreateBuilder(args);

// --- Options binding with startup validation ----------------------------------------
builder.Services
    .AddOptions<TrendsOptions>()
    .Bind(builder.Configuration.GetSection(TrendsOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

// --- Application services ------------------------------------------------------------
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ITrendRequestValidator, TrendRequestValidator>();
builder.Services.AddSingleton<ITrendsFetcherClient, TrendsFetcherClient>();
builder.Services.AddSingleton<ForecastService>();
builder.Services.AddSingleton<ITrendsService, TrendsService>();

// --- ProblemDetails + global exception handling --------------------------------------
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

// --- Health checks -------------------------------------------------------------------
builder.Services
    .AddHealthChecks()
    .AddCheck<TrendsFetcherHealthCheck>("trends-fetcher");

// --- Controllers + JSON --------------------------------------------------------------
builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

// --- CORS — open in Development, configurable in Production --------------------------
const string CorsPolicy = "TrendsCors";
builder.Services.AddCors(o =>
{
    o.AddPolicy(CorsPolicy, p =>
    {
        if (builder.Environment.IsDevelopment())
        {
            p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
            return;
        }
        var origins = builder.Configuration
            .GetSection(TrendsOptions.SectionName)
            .Get<TrendsOptions>()?
            .AllowedOrigins;
        if (origins is { Length: > 0 })
            p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
    });
});

// --- Rate limiting (fixed window per IP) ---------------------------------------------
builder.Services.AddRateLimiter(opts =>
{
    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opts.AddPolicy("trends", httpCtx =>
    {
        var perMinute = httpCtx.RequestServices
            .GetRequiredService<Microsoft.Extensions.Options.IOptions<TrendsOptions>>()
            .Value.RateLimitPerMinute;
        var key = httpCtx.Connection.RemoteIpAddress?.ToString() ?? "anon";
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = perMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
        });
    });
});

// --- OpenAPI -------------------------------------------------------------------------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

// --- HTTP request logging ------------------------------------------------------------
builder.Services.AddHttpLogging(o =>
{
    o.LoggingFields =
        Microsoft.AspNetCore.HttpLogging.HttpLoggingFields.RequestMethod
        | Microsoft.AspNetCore.HttpLogging.HttpLoggingFields.RequestPath
        | Microsoft.AspNetCore.HttpLogging.HttpLoggingFields.ResponseStatusCode
        | Microsoft.AspNetCore.HttpLogging.HttpLoggingFields.Duration;
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseHttpLogging();
app.UseCors(CorsPolicy);
app.UseRateLimiter();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapOpenApi();
app.MapHealthChecks("/api/health");
app.MapControllers();
app.MapSpaFallback();

app.Run();
