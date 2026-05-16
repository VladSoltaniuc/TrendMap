namespace TrendMap.Api.Infrastructure;

public static class WebApplicationExtensions
{
    /// <summary>
    /// Serves wwwroot/index.html for any non-API route. Non-existent /api/* paths return 404.
    /// </summary>
    public static WebApplication MapSpaFallback(this WebApplication app)
    {
        app.MapFallback(async ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.StatusCode = StatusCodes.Status404NotFound;
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
                ctx.Response.StatusCode = StatusCodes.Status404NotFound;
            }
        });
        return app;
    }
}
