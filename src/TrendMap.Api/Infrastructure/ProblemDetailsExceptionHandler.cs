using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using TrendMap.Api.Errors;

namespace TrendMap.Api.Infrastructure;

public sealed class ProblemDetailsExceptionHandler : IExceptionHandler
{
    private readonly IHostEnvironment _env;
    private readonly ILogger<ProblemDetailsExceptionHandler> _log;

    public ProblemDetailsExceptionHandler(
        IHostEnvironment env,
        ILogger<ProblemDetailsExceptionHandler> log)
    {
        _env = env;
        _log = log;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problem = BuildProblem(exception, httpContext);

        if (exception is TrendDomainException)
            _log.LogWarning(exception, "Domain error: {Title}", problem.Title);
        else
            _log.LogError(exception, "Unhandled error: {Title}", problem.Title);

        httpContext.Response.StatusCode = problem.Status ?? StatusCodes.Status500InternalServerError;
        httpContext.Response.ContentType = "application/problem+json";
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken: cancellationToken);
        return true;
    }

    private ProblemDetails BuildProblem(Exception exception, HttpContext ctx)
    {
        if (exception is TrendDomainException domain)
        {
            return new ProblemDetails
            {
                Type = domain.ProblemType,
                Title = domain.ProblemTitle,
                Status = domain.StatusCode,
                Detail = domain.Message,
                Instance = ctx.Request.Path,
            };
        }

        return new ProblemDetails
        {
            Type = "https://trendmap.dev/problems/internal",
            Title = "An unexpected error occurred",
            Status = StatusCodes.Status500InternalServerError,
            Detail = _env.IsDevelopment()
                ? $"{exception.GetType().Name}: {exception.Message}"
                : "The server encountered an unexpected condition that prevented it from fulfilling the request.",
            Instance = ctx.Request.Path,
        };
    }
}
