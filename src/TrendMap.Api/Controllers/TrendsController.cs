using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TrendMap.Api.Models;
using TrendMap.Api.Services;

namespace TrendMap.Api.Controllers;

[ApiController]
[Route("api/trends")]
[Produces("application/json")]
public sealed class TrendsController : ControllerBase
{
    private readonly ITrendsService _trends;

    public TrendsController(ITrendsService trends) => _trends = trends;

    /// <summary>
    /// Returns historical search-interest values for a keyword plus a 12-month forecast.
    /// </summary>
    [HttpPost]
    [EnableRateLimiting("trends")]
    [ProducesResponseType(typeof(TrendResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status502BadGateway)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status504GatewayTimeout)]
    public async Task<ActionResult<TrendResponse>> Post(
        [FromBody] TrendRequest req, CancellationToken ct)
    {
        var result = await _trends.GetAsync(req, ct);
        return Ok(result);
    }
}
