import { buildLead, extractAttr, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'linkedin@1.0.0';

export function parseLinkedIn($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['.reusable-search__result-container', '.entity-result', 'li'],
    buildRecord: (root) => buildLead({
      businessName: extractText($, root, ['.entity-result__title-text', '.app-aware-link span[aria-hidden="true"]', 'h3']),
      website: extractAttr($, root, ['a[href^="http"]']),
      location: extractText($, root, ['.entity-result__secondary-subtitle', '.subline-level-2', '.location']),
      category: extractText($, root, ['.entity-result__primary-subtitle', '.subline-level-1', '.category']),
      profileUrl: normalizeUrl(extractAttr($, root, ['a.app-aware-link', 'a[href*="/company/"]'])),
    }, 'linkedin', parserVersion, fingerprint),
  });
}
