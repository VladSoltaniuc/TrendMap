# --- Stage 1: build React frontend ---
FROM node:20-alpine AS web-build
WORKDIR /web
COPY src/TrendMap.Web/package.json src/TrendMap.Web/package-lock.json* ./
RUN npm install
COPY src/TrendMap.Web/ ./
RUN npm run build

# --- Stage 2: build .NET API ---
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api-build
WORKDIR /src
COPY TrendMap.sln ./
COPY src/TrendMap.Api/ ./src/TrendMap.Api/
RUN dotnet restore src/TrendMap.Api/TrendMap.Api.csproj
RUN dotnet publish src/TrendMap.Api/TrendMap.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# --- Stage 3: runtime — .NET ASP.NET + Python 3 ---
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Install Python and pip (pytrends + pandas)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set up Python venv to avoid PEP 668 "externally-managed-environment" errors on Debian 12
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

COPY src/TrendMap.Api/scripts/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Copy published .NET app and built React assets
COPY --from=api-build /app/publish ./
COPY --from=web-build /web/dist ./wwwroot

# Tell the .NET app to use the venv's python
ENV Trends__PythonExecutable=/opt/venv/bin/python
ENV ASPNETCORE_URLS=http://+:8080
ENV DOTNET_RUNNING_IN_CONTAINER=true

EXPOSE 8080
ENTRYPOINT ["dotnet", "TrendMap.Api.dll"]
