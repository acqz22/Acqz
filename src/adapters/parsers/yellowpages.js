import { buildLead, extractAttr, extractText, extractEmail, extractFromRegex, parseBySelectorChain } from './utils.js';

export const parserVersion = 'yellowpages@1.0.0';

export function parseYellowPages($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['.result', '.v-card', '.search-results .info'],
    buildRecord: (root) => {
      const text = root.text();
      return buildLead({
        businessName: extractText($, root, ['.business-name', 'h2 a', '.n']),
        phone: extractText($, root, ['.phones', '.phone', '.call']) || extractFromRegex(text, /(\+?\d[\d\s\-()]{8,})/),
        email: extractEmail(text),
        website: extractAttr($, root, ['.track-visit-website', 'a[href^="http"]']),
        location: extractText($, root, ['.adr', '.street-address', '.address']),
        category: extractText($, root, ['.categories', '.category']),
        profileUrl: extractAttr($, root, ['.business-name', 'h2 a']),
      }, 'yellowpages', parserVersion, fingerprint);
    },
  });
}
