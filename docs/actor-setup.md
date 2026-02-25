# Actor Scraper Setup and Runtime Details

## Actor lifecycle
1. Request enters `/jobs` or MCP `leadgen.run`.
2. Request validated against universal schema.
3. Keyword discovery expands and ranks keyword set.
4. Platform adapter executes fetch+parse loops.
5. Normalizer maps records into common lead format.
6. Confidence and location filtering applied.
7. Cross-platform dedupe merges duplicate businesses.
8. Result exposed by `/jobs/:id` and MCP `leadgen.status`.

## Adapter implementation details
- `src/adapters/index.js` provides URL builders for each actor.
- `src/adapters/baseAdapter.js` provides shared fetch+parse behavior.
- New actors can be added with a URL builder and optional parser override.

## Fingerprint suite
- `src/fingerprint/fingerprintSuite.js` rotates UA/header profiles.
- Fingerprints are deterministic per request seed for reproducibility.

## Agent skills
- Located in `skills/*/SKILL.md`.
- Each actor has a dedicated trigger/workflow contract.

## MCP details
- `src/mcp/server.js` handles JSON-RPC requests.
- `tools/list` advertises available tools.
- `leadgen.run` creates a job.
- `leadgen.status` returns progress/output.
