# Acqz Lead Engine (Apify-inspired, independent stack)

This repository now provides an **Apify-style ecosystem architecture** without copying proprietary code:

- **Unified actor runtime contract** for 10 lead platforms.
- **MCP server endpoint** (`/mcp`) exposing job tools.
- **Agent skills** for each actor under `skills/*/SKILL.md`.
- **Fingerprint suite module** for request profile rotation.
- **Async job orchestration** and status polling.
- **Universal input/output schema** for n8n or other orchestrators.

> Compliance note: this project is designed for lawful data collection from publicly available sources and does not include guidance for bypassing platform restrictions.

## Supported actor platforms

1. Instagram
2. Facebook
3. LinkedIn
4. Google Maps
5. Google Ads Transparency
6. Meta Ads Library
7. X
8. TikTok
9. Yellow Pages
10. Justdial

## API

### `POST /jobs`
Submit a universal lead request:

```json
{
  "requestId": "optional-uuid",
  "platforms": ["instagram", "google_maps"],
  "keywords": ["dentist", "orthodontist"],
  "location": "Austin, Texas",
  "leadCount": 100,
  "filters": { "verifiedOnly": true },
  "extractDetails": true,
  "extractSocialLinks": true,
  "dedupe": true,
  "minimumConfidence": 40
}
```

### `GET /jobs/:id`
Fetch status and results for submitted job.

### `POST /mcp`
Minimal MCP-compatible JSON-RPC interface:
- `tools/list`
- `tools/call` with `leadgen.run`
- `tools/call` with `leadgen.status`

## Why this architecture

- **Modularity**: each platform is an adapter behind a common interface.
- **Performance**: async orchestration with request budgets by platform.
- **Portability**: unified schema and MCP tools allow external orchestration (n8n, custom apps, agents).
- **Observability-friendly**: jobs keep per-platform errors and deterministic IDs.

## Run locally

```bash
npm install
npm run start
```

Optional env:
- `ZENROWS_API_KEY` for managed fetching.
- `PORT` (default `10000`).
