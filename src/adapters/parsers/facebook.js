import { buildLead, extractAttr, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'facebook@1.0.0';

export function parseFacebook($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['[role="article"]', '.x1yztbdb', '.rq0escxv'],
    buildRecord: (root) => buildLead({
      businessName: extractText($, root, ['strong', 'h2', 'a[role="link"] span']),
      phone: extractText($, root, ['.phone', '[data-testid="info_phone"]']),
      website: extractAttr($, root, ['a[href^="http"]:not([href*="facebook.com"])', 'a.external']),
      location: extractText($, root, ['.location', '[data-testid="info_address"]']),
      category: extractText($, root, ['.category', '[data-testid="biz_category"]']),
      profileUrl: normalizeUrl(extractAttr($, root, ['a[role="link"]', 'a[href*="facebook.com"]'])),
    }, 'facebook', parserVersion, fingerprint),
  });
}
