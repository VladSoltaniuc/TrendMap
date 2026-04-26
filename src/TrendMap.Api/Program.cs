using Microsoft.AspNetCore.Http.Json;
using TrendMap.Api.Models;
using TrendMap.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<ITrendsClient, PyTrendsClient>();
builder.Services.AddSingleton<ForecastService>();
builder.Services.AddSingleton<TrendsService>();

builder.Services.Configure<JsonOptions>(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .AllowAnyOrigin()
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseCors();

app.UseExceptionHandler(exApp => exApp.Run(async ctx =>
{
    var ex = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    ctx.Response.StatusCode = 500;
    ctx.Response.ContentType = "application/json";
    ctx.Response.Headers["Access-Control-Allow-Origin"] = "*";
    await ctx.Response.WriteAsJsonAsync(new
    {
        error = ex != null ? $"{ex.GetType().Name}: {ex.Message}" : "Unknown error"
    });
}));
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/trends", async (TrendRequest req, TrendsService svc, CancellationToken ct) =>
{
    try
    {
        var result = await svc.GetAsync(req, ct);
        return Results.Ok(result);
    }
    catch (ArgumentException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
    catch (TimeoutException ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: 504);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: 502);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = $"Unexpected error: {ex.GetType().Name}: {ex.Message}" }, statusCode: 500);
    }
});

// SPA fallback — serve index.html for any non-API route.
app.MapFallback(async ctx =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.StatusCode = 404;
        return;
    }
    var indexPath = Path.Combine(app.Environment.WebRootPath, "index.html");
    if (File.Exists(indexPath))
    {
        ctx.Response.ContentType = "text/html";
        await ctx.Response.SendFileAsync(indexPath);
    }
    else
    {
        ctx.Response.StatusCode = 404;
    }
});

app.Run();
