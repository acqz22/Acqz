# Acqz

Asynchronous lead scraping API with a platform-aware worker queue.

## Endpoints

- `POST /jobs` — create an async scrape job and return `jobId` immediately.
- `GET /jobs/:id` — retrieve job status, progress, errors, and partial/final results.
- `POST /scrape` — backward-compatible alias for `POST /jobs`.

## `POST /jobs` payload

```json
{
  "platforms": ["google_search", "linkedin"],
  "search": "dentist",
  "location": "Austin, TX",
  "maxLeadsPerPlatform": 40,
  "input": {
    "niche": "dental"
  },
  "callbackUrl": "https://your-n8n-instance/webhook/acqz"
}
```

## Webhook callback

When `callbackUrl` is provided, Acqz sends a signed `job.completed` payload.

Headers:

- `x-acqz-timestamp`
- `x-acqz-signature` (present when `WEBHOOK_SIGNING_SECRET` is configured)

Signature format:

- `HMAC_SHA256(secret, "${timestamp}.${rawJsonBody}")`

## Configuration

- `ZENROWS_API_KEY`
- `PORT` (default `10000`)
- `PLATFORM_CONCURRENCY` (default `2`)
- `PLATFORM_CONCURRENCY_<PLATFORM>` (optional per-platform override, e.g. `PLATFORM_CONCURRENCY_GOOGLE_SEARCH=1`)
- `PLATFORM_TASK_MAX_RETRIES` (default `3`)
- `RETRY_BASE_DELAY_MS` (default `700`)
- `RETRY_MAX_DELAY_MS` (default `8000`)
- `WEBHOOK_SIGNING_SECRET` (optional)
- `JOB_TTL_MS` (default `21600000`)

## Retry strategy

Platform tasks use exponential backoff with jitter for transient errors (`408`, `425`, `429`, `5xx`, and common network timeouts/resets).
