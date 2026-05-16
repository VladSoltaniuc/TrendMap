namespace TrendMap.Api.Errors;

public abstract class TrendDomainException : Exception
{
    protected TrendDomainException(string message) : base(message) { }
    protected TrendDomainException(string message, Exception inner) : base(message, inner) { }

    public abstract int StatusCode { get; }
    public abstract string ProblemType { get; }
    public abstract string ProblemTitle { get; }
}

public sealed class InvalidRequestException : TrendDomainException
{
    public InvalidRequestException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status400BadRequest;
    public override string ProblemType => "https://trendmap.dev/problems/invalid-request";
    public override string ProblemTitle => "Invalid request";
}

public sealed class UpstreamException : TrendDomainException
{
    public UpstreamException(string message) : base(message) { }
    public UpstreamException(string message, Exception inner) : base(message, inner) { }

    public override int StatusCode => StatusCodes.Status502BadGateway;
    public override string ProblemType => "https://trendmap.dev/problems/upstream-error";
    public override string ProblemTitle => "Upstream trends provider error";
}

public sealed class UpstreamTimeoutException : TrendDomainException
{
    public UpstreamTimeoutException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status504GatewayTimeout;
    public override string ProblemType => "https://trendmap.dev/problems/upstream-timeout";
    public override string ProblemTitle => "Upstream trends provider timed out";
}
