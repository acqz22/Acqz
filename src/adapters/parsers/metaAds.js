import { buildLead, extractAttr, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'meta_ads@1.0.0';

export function parseMetaAds($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['[data-testid="ad_library_ad_card"]', '.xh8yej3', '[role="article"]'],
    buildRecord: (root) => buildLead({
      businessName: extractText($, root, ['strong', 'h2', '.x193iq5w']),
      website: extractAttr($, root, ['a[href^="http"]']),
      category: extractText($, root, ['.x78zum5 .x1iyjqo2', '.category']),
      profileUrl: normalizeUrl(extractAttr($, root, ['a[href*="facebook.com"]', 'a[role="link"]'])),
    }, 'meta_ads', parserVersion, fingerprint),
  });
}
