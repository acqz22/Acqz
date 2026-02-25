# Acqz Scraper Service

## Security and compliance capabilities

This service now includes:

- HMAC request authentication between n8n and the scraper service with key rotation support (`x-signing-key-id`).
- Per API key rate limiting and abuse lockouts.
- Secret loading from environment variables or HashiCorp Vault KV.
- Data retention controls with `retentionDays` and a cleanup job endpoint.
- Compliance guardrails with robots/TOS-aware flags and platform allowlisting.

## Environment variables

### Required

- `ZENROWS_API_KEY`
- `CLIENT_API_KEYS` (example: `n8n-prod:client-secret`)
- `SCRAPER_SIGNING_KEYS` (example: `kid-2026-01:hmac-secret,kid-2025-12:old-secret`)

### Optional

- `ACTIVE_SIGNING_KEY_ID`
- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_MAX_REQUESTS` (default `30`)
- `ABUSE_LOCK_MS` (default `300000`)
- `DEFAULT_RETENTION_DAYS` (default `30`)
- `RETENTION_CLEANUP_MS` (default `60000`)
- `ALLOWED_PLATFORMS` (comma-separated allowlist)
- `ENFORCE_ROBOTS_AWARE_MODE` (`true|false`)
- `ENFORCE_TOS_AWARE_MODE` (`true|false`)

### Vault mode

Set:

- `SECRET_PROVIDER=vault`
- `VAULT_ADDR`
- `VAULT_TOKEN`
- `VAULT_SECRET_PATH`

Vault data can contain:

- `ZENROWS_API_KEY`
- `CLIENT_API_KEYS_JSON`
- `SCRAPER_SIGNING_KEYS_JSON`
- `ACTIVE_SIGNING_KEY_ID`

## HMAC signing contract

n8n signs request payloads as:

```text
<METHOD>\n<PATH>\n<TIMESTAMP_MS>\n<NONCE>\n<BODY_JSON>
```

Headers:

- `x-api-key-id`
- `x-api-key`
- `x-signing-key-id`
- `x-signature-timestamp`
- `x-signature-nonce`
- `x-signature` (hex sha256 HMAC)

## Scrape request payload additions

```json
{
  "platforms": ["google_search"],
  "location": "Berlin",
  "search": "restaurant",
  "retentionDays": 14,
  "compliance": {
    "respectRobots": true,
    "respectTos": true,
    "strictMode": true,
    "platformAllowlist": ["google_search", "yellowpages"]
  }
}
```

## Run

```bash
npm start
```
