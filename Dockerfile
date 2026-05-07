# --- Stage 1: build React frontend ---
FROM node:20-alpine AS web-build
WORKDIR /web
COPY src/TrendMap.Web/package.json src/TrendMap.Web/package-lock.json* ./
RUN npm install
COPY src/TrendMap.Web/ ./
RUN npm run build

# --- Stage 2: install Node script dependencies ---
FROM node:20-alpine AS scripts-build
WORKDIR /scripts
COPY src/TrendMap.Api/scripts/package.json src/TrendMap.Api/scripts/package-lock.json* ./
RUN npm install --omit=dev

# --- Stage 3: build .NET API ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
WORKDIR /src
COPY TrendMap.sln ./
COPY src/TrendMap.Api/ ./src/TrendMap.Api/
RUN dotnet restore src/TrendMap.Api/TrendMap.Api.csproj
RUN dotnet publish src/TrendMap.Api/TrendMap.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# --- Stage 4: runtime — .NET ASP.NET + Node.js ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Install Node.js 20 from NodeSource
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy published .NET app and built React assets
COPY --from=api-build /app/publish ./
COPY --from=web-build /web/dist ./wwwroot

# Copy Node script + its dependencies
COPY src/TrendMap.Api/scripts/fetch_trends.js ./scripts/fetch_trends.js
COPY --from=scripts-build /scripts/node_modules ./scripts/node_modules

ENV Trends__NodeExecutable=node
ENV DOTNET_RUNNING_IN_CONTAINER=true
ENV ASPNETCORE_URLS=http://+:8080

EXPOSE 8080
ENTRYPOINT ["dotnet", "TrendMap.Api.dll"]
