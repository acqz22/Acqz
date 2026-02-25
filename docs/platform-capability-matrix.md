# Platform Capability Matrix

This matrix documents what the current `/scrape` pipeline can *reasonably* discover from each configured platform in `server.js`, the inputs it requires, and operational fallback behavior.

## Scope and assumptions

- The current runtime uses HTML retrieval via ZenRows and parser heuristics built around selector groups in `server.js`.
- Confidence values below are pragmatic expectations for the existing parsing strategy, not formal SLAs.
- “Discoverable entity types” means what can be extracted from public page HTML through the current selectors/regex.

---

## Platform-by-platform matrix

| Platform key | Primary target URL pattern | Discoverable entity types | Likely contact fields found | Required inputs | Optional filters / tunables | Known limitations | Confidence expectation |
|---|---|---|---|---|---|---|---|
| `google_maps` | `google.com/maps/search/{query + location}` | Local business listings, place names, map-pack style entries | Phone (regex), address (partial selector), listing URL (if available) | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Heavy JS rendering; markup churn; anti-bot interstitials can reduce usable HTML | **Medium**: strong when selectors align; drops quickly during UI/markup changes |
| `google_search` | `google.com/search?q={query + location}` | General web results, business/site snippets | URL, possible phone in snippet text, occasional address text | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Generic SERP blocks are volatile (`.g`, `[jsname]` etc.); not all snippets contain contact data | **Medium** for URL discovery, **Low–Medium** for direct contact fields |
| `google_ads` | `google.com/search?q={query + location}` | Same as `google_search` under current implementation | Same as `google_search` | `platforms`, `location`, `ZENROWS_API_KEY` | Same as `google_search` | No dedicated ads parsing path; treated like generic Google result parsing | **Low–Medium** for ad-specific intelligence |
| `instagram` | `instagram.com/explore/search/keyword/?q={query}` | Profile-like text fragments, handles, short content labels | Handle-like text (`@`), occasional phone-like text if present in rendered content | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Login walls, dynamic hydration, sparse static HTML; fallback extraction is noisy | **Low** |
| `linkedin` | `linkedin.com/search/results/companies/?keywords={query}` | Company-result text fragments | Rarely direct contact data; mostly names/labels | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Auth-gated content and anti-automation protections strongly limit extraction | **Low** |
| `facebook` | `facebook.com/search/pages?q={query}` | Page title/text fragments | Possible handle/email/phone-like tokens in visible text; often none | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Frequent anti-bot/login barriers; selector-free fallback is broad and can be noisy | **Low** |
| `meta_ads` | `facebook.com/ads/library/?q={query}` | Ad/page text fragments | Usually page names and snippets; direct phone/email uncommon | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Dynamic/adaptive UI; current parser has no ad-specific structured selector logic | **Low** |
| `youtube` | `youtube.com/results?search_query={query}` | Channel/video title fragments | Rarely direct contact fields in search HTML | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Highly script-driven payloads; fallback can over-capture generic labels | **Low** |
| `twitter` | `twitter.com/explore?q={query}` | Profile/post text fragments (if any public HTML is accessible) | Handle-like text, occasional URL fragments | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Aggressive anti-bot and dynamic rendering; extraction often sparse | **Low** |
| `yellowpages` | `yellowpages.com/search?...` | Business directory records | Business name, phone, street address | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Query URL template currently appears malformed in code and may require correction; directory DOM can vary by locale | **Medium–High** once URL/selector alignment is correct |
| `justdial` | `justdial.com/{location}/{query}` | Local listing cards | Business name, phone, address | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | URL template currently appears malformed in code and may need correction; anti-scrape throttling possible | **Medium** once URL template is fixed |
| `tiktok` | `tiktok.com/search?q={query}` | User/content text fragments | Handle-like text, occasional external link text | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Dynamic rendering; fallback not schema-aware, causing low precision | **Low** |
| `default` (unknown platform key) | Falls back to Google web search | Generic SERP entities | URL, occasional phone/address in snippets | `platforms`, `location`, `ZENROWS_API_KEY` | `search`, `input.niche`, `maxLeadsPerPlatform` | Unknown platform aliases silently remap to Google path | **Medium** for websites, **Low–Medium** for contacts |

---

## Input contract (current behavior)

### Required inputs

1. `platforms` (array or string): one or more platform keys.
2. `location` (string): required even for platforms where it is not directly used in URL construction.
3. `ZENROWS_API_KEY` environment variable.

### Optional inputs and filters

- `search` (string): preferred query term.
- `input.niche` / `input.search`: fallback query sources when `search` is missing.
- `input.location`: fallback location when top-level `location` is missing (note: request currently still validates top-level `location` before this fallback is used).
- `maxLeadsPerPlatform` (default `40`, hard cap `80`): per-platform extraction ceiling.

### Cross-cutting known limitations

- The parser is selector/regex heuristic-based and sensitive to upstream DOM changes.
- Social platforms frequently provide limited unauthenticated HTML content.
- A single failed platform currently returns an error entry for that platform but does not abort the entire batch.

---

## Confidence model by platform family

- **Directory/local intent sources** (`yellowpages`, `justdial`, `google_maps`): highest probability of direct contact fields (phone/address) when URL templates and selectors remain valid.
- **General search sources** (`google_search`, `google_ads`, default fallback): reliable for discovering websites, less reliable for direct phone/address extraction.
- **Social/search feeds** (`instagram`, `linkedin`, `facebook`, `meta_ads`, `youtube`, `twitter`, `tiktok`): good for weak signals (names/handles), low confidence for structured contact fields without secondary crawl.

Use confidence labels operationally:

- **High**: likely structured contact fields with minimal post-processing.
- **Medium**: generally useful records but partial/noisy contacts expected.
- **Low**: weak signal source; route to enrichment before lead qualification.

---

## Fallback and enrichment routes

When a platform yields low-confidence entities or missing contact fields, apply staged fallback routes:

1. **Social profile ➜ website extraction**  
   Parse profile/about text for external domain links.
2. **Website homepage crawl**  
   Crawl root + obvious nav targets (`/contact`, `/about`, `/team`, `/locations`).
3. **Contact page deepening**  
   Extract `mailto:`, `tel:`, structured data (`Organization`, `LocalBusiness`), footer/legal pages.
4. **SERP/domain corroboration**  
   Re-query company name + location in `google_search` to confirm canonical domain and phone consistency.
5. **Directory cross-check**  
   If available, compare with directory platforms (`yellowpages`, `justdial`) for phone/address normalization.
6. **Confidence escalation policy**  
   Promote lead confidence only when at least two independent sources agree on core fields (name + one contact field).

Recommended fallback routing by source class:

- **Social-first hit**: social ➜ website ➜ contact-page crawl.
- **SERP-first hit**: website ➜ contact-page crawl ➜ directory corroboration.
- **Directory-first hit**: directory ➜ website validation ➜ SERP corroboration.

---

## Maintenance guide (selectors and breakage patterns)

### Selector update playbook

1. **Track extractor groups by platform family**
   - Google selectors (`.g`, `.Nv2G9d`, `.fontHeadlineSmall`, `.section-result`, `[jsname]`).
   - Directory selectors (`.result`, `.jdgm-listing`, `.business-name`, `.phones`, `.street-address`, etc.).
   - Social fallback tags (`a`, `h1`, `h2`, `span`) plus text heuristics.
2. **Snapshot and diff raw HTML** for representative queries weekly.
3. **Version selector sets** with date-stamped changelog entries.
4. **Add canary queries** per platform to detect breakage before production impact.
5. **Regress against historical fixtures** to prevent accidental precision/recall drops.

### Common breakage patterns

- CSS class renames and obfuscation on major platforms.
- Shift from server-rendered markup to client-hydrated JSON payloads.
- Anti-bot response pages with valid HTTP status but invalid content shape.
- Locale-dependent DOM variants causing selector misses.
- URL template regressions (string interpolation or escaping mistakes).

### Operational signals to monitor

- Sudden drop in per-platform result count.
- Spike in “no public leads visible” placeholders.
- Increased parsing of short/generic tokens (noise increase).
- Rising timeout/error rate from upstream fetch provider.

### Maintenance cadence recommendation

- **Weekly:** selector canary run + spot fixes.
- **Monthly:** confidence calibration against labeled samples.
- **Quarterly:** platform matrix review (entity/field expectations, fallback policy, and limits).

