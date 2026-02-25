---
name: google-ads-transparency-lead-actor
description: Discover advertisers by keyword and map to public business entities.
---

# google-ads-transparency lead actor skill

## Trigger
Use this skill when the request targets **google-ads-transparency** for keyword + location lead discovery.

## Input mapping
- `keywords[]`: search intent terms.
- `location`: city/region filter.
- `leadCount`: cap output volume.
- `filters`: optional platform-specific filters (verified, recency, category).

## Execution workflow
1. Build query URL using adapter conventions.
2. Fetch page with request fingerprint profile.
3. Parse candidate entities and public contact fields.
4. Normalize fields into universal lead schema.
5. Apply confidence + location filters before returning.

## Output contract
Return an array of normalized leads with:
- `businessName`
- `phones[]`
- `emails[]`
- `website`
- `socialLinks[]`
- `sourcePlatform`
- `sourceUrl`
- `confidence`
