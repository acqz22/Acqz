import { buildLead, extractAttr, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'google_maps@1.0.0';

export function parseGoogleMaps($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['.Nv2PK', '.section-result', '[role="article"]'],
    buildRecord: (root) => buildLead({
      businessName: extractText($, root, ['.qBF1Pd', '.fontHeadlineSmall', '.section-result-title']),
      phone: extractText($, root, ['.UsdlK', '.phone', '[data-phone]']),
      website: normalizeUrl(extractAttr($, root, ['a[data-value="Website"]', 'a.website', 'a[href^="http"]'])),
      location: extractText($, root, ['.W4Efsd:last', '.section-result-location', '.address']),
      category: extractText($, root, ['.W4Efsd:first', '.section-result-details', '.category']),
      profileUrl: normalizeUrl(extractAttr($, root, ['a.hfpxzc', 'a.section-result-action', 'a[href*="/maps/place"]'])),
      email: '',
    }, 'google_maps', parserVersion, fingerprint),
  });
}
