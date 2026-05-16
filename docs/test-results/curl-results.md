# Curl test results

## C1 health
```
$ curl -sS -i http://localhost:5080/api/health | head -10
HTTP/1.1 200 OK
Content-Type: text/plain
Date: Fri, 15 May 2026 21:15:16 GMT
Server: Kestrel
Cache-Control: no-store, no-cache
Expires: Thu, 01 Jan 1970 00:00:00 GMT
Pragma: no-cache
Transfer-Encoding: chunked

Healthy```

## C2 bitcoin US 5-y (happy path)
```
$ curl -sS -w '\nHTTP %{http_code}\n' -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"bitcoin","geo":"US","timeframe":"today 5-y"}' | head -c 600
{"keyword":"bitcoin","geo":"US","timeframe":"today 5-y","historical":[{"date":"2021-05-09","value":64},{"date":"2021-05-16","value":100},{"date":"2021-05-23","value":69},{"date":"2021-05-30","value":48},{"date":"2021-06-06","value":55},{"date":"2021-06-13","value":44},{"date":"2021-06-20","value":50},{"date":"2021-06-27","value":37},{"date":"2021-07-04","value":30},{"date":"2021-07-11","value":29},{"date":"2021-07-18","value":33},{"date":"2021-07-25","value":39},{"date":"2021-08-01","value":31},{"date":"2021-08-08","value":38},{"date":"2021-08-15","value":30},{"date":"2021-08-22","value":31},{```

## C3 electric car Worldwide 5-y
```
$ curl -sS -w '\nHTTP %{http_code}\n' -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"electric car","geo":"","timeframe":"today 5-y"}' | head -c 400
{"keyword":"electric car","geo":"","timeframe":"today 5-y","historical":[{"date":"2021-05-09","value":23},{"date":"2021-05-16","value":23},{"date":"2021-05-23","value":23},{"date":"2021-05-30","value":23},{"date":"2021-06-06","value":23},{"date":"2021-06-13","value":26},{"date":"2021-06-20","value":25},{"date":"2021-06-27","value":25},{"date":"2021-07-04","value":26},{"date":"2021-07-11","value":2```

## C4 chatgpt US 12-m
```
$ curl -sS -w '\nHTTP %{http_code}\n' -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"chatgpt","geo":"US","timeframe":"today 12-m"}' | head -c 400
{"keyword":"chatgpt","geo":"US","timeframe":"today 12-m","historical":[{"date":"2025-05-11","value":75},{"date":"2025-05-18","value":75},{"date":"2025-05-25","value":71},{"date":"2025-06-01","value":71},{"date":"2025-06-08","value":76},{"date":"2025-06-15","value":71},{"date":"2025-06-22","value":73},{"date":"2025-06-29","value":64},{"date":"2025-07-06","value":72},{"date":"2025-07-13","value":80}```

## C5 cache hit (repeat C2)
```
$ curl -sS -w '\nHTTP %{http_code}\n' -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"bitcoin","geo":"US","timeframe":"today 5-y"}' | grep -o '"fromCache":[^,}]*'
"fromCache":true
```

## C6 empty keyword (400)
```
$ curl -sS -i -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"","geo":"US"}' | head -20
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Date: Fri, 15 May 2026 21:17:18 GMT
Server: Kestrel
Cache-Control: no-cache,no-store
Expires: -1
Pragma: no-cache
Transfer-Encoding: chunked

{"type":"https://trendmap.dev/problems/invalid-request","title":"Invalid request","status":400,"detail":"Keyword is required.","instance":"/api/trends"}```

## C7 bad geo (400)
```
$ curl -sS -i -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"x","geo":"NOTACOUNTRY"}' | head -20
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Date: Fri, 15 May 2026 21:17:18 GMT
Server: Kestrel
Cache-Control: no-cache,no-store
Expires: -1
Pragma: no-cache
Transfer-Encoding: chunked

{"type":"https://trendmap.dev/problems/invalid-request","title":"Invalid request","status":400,"detail":"Invalid geo code. Expected an ISO country code such as 'US' or 'US-NY'.","instance":"/api/trends"}```

## C8 bad timeframe (400)
```
$ curl -sS -i -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"x","geo":"US","timeframe":"forever"}' | head -20
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Date: Fri, 15 May 2026 21:17:18 GMT
Server: Kestrel
Cache-Control: no-cache,no-store
Expires: -1
Pragma: no-cache
Transfer-Encoding: chunked

{"type":"https://trendmap.dev/problems/invalid-request","title":"Invalid request","status":400,"detail":"Invalid timeframe. Use formats like 'today 5-y', 'now 7-d', or 'YYYY-MM-DD YYYY-MM-DD'.","instance":"/api/trends"}```

## C9 inverted date range (400)
```
$ curl -sS -i -X POST http://localhost:5080/api/trends -H 'Content-Type: application/json' -d '{"keyword":"x","geo":"US","timeframe":"2024-12-31 2024-01-01"}' | head -20
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
Date: Fri, 15 May 2026 21:17:18 GMT
Server: Kestrel
Cache-Control: no-cache,no-store
Expires: -1
Pragma: no-cache
Transfer-Encoding: chunked

{"type":"https://trendmap.dev/problems/invalid-request","title":"Invalid request","status":400,"detail":"Timeframe end date must be on or after start date.","instance":"/api/trends"}```

## C10 OpenAPI doc
```
$ curl -sS -w '\nHTTP %{http_code}\n' http://localhost:5080/openapi/v1.json | head -c 400
{
  "openapi": "3.1.1",
  "info": {
    "title": "TrendMap.Api | v1",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "http://localhost:5080/"
    }
  ],
  "paths": {
    "/api/trends": {
      "post": {
        "tags": [
          "Trends"
        ],
        "summary": "Returns historical search-interest values for a keyword plus a 12-month forecast.",
        "requestBody": {
     curl: Failed writing body
```


_(see /tmp/openapi.json — 3.1.1 spec generated)_
