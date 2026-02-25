# Acqz

Lead scraping API with an observability layer suitable for orchestration environments.

## Features
- Structured JSON logs with `requestId`, `jobId`, `platform`, and `adapterVersion`
- Runtime counters for success/failure/timeout, leads extracted, parser attempts/hits
- Per-stage timing spans for `fetch`, `parse`, `normalize`, and `dedupe`
- Dead-letter queue for platforms that repeatedly fail
- Health/readiness endpoints for container and orchestration probes

## Endpoints
- `GET /health` - liveness
- `GET /ready` - readiness (checks `ZENROWS_API_KEY`)
- `GET /metrics` - aggregated counters and parser hit ratios
- `GET /dead-letters` - current in-memory dead-letter queue
- `POST /scrape` - scrape job entrypoint

## Runtime configuration
- `ZENROWS_API_KEY` (required)
- `PORT` (default `10000`)
- `ADAPTER_VERSION` (default `v5`)
- `REQUEST_TIMEOUT_MS` (default `40000`)
- `DEAD_LETTER_THRESHOLD` (default `3`)
- `DEAD_LETTER_MAX_SIZE` (default `500`)
