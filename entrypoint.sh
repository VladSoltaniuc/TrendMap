#!/bin/sh
# Railway sets $PORT; fall back to 8080 for local Docker runs.
export ASPNETCORE_URLS="http://+:${PORT:-8080}"
exec dotnet TrendMap.Api.dll
