import { buildLead, extractAttr, extractText, extractEmail, extractFromRegex, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'google_search@1.0.0';

export function parseGoogleSearch($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['.g', '.MjjYud', '[data-sokoban-container]'],
    buildRecord: (root) => {
      const snippet = extractText($, root, ['.VwiC3b', '.st', '.snippet']);
      return buildLead({
        businessName: extractText($, root, ['h3', '.LC20lb', '.DKV0Md']),
        phone: extractFromRegex(snippet, /(\+?\d[\d\s\-()]{8,})/),
        email: extractEmail(snippet),
        website: normalizeUrl(extractAttr($, root, ['a[href^="http"]'])),
        location: extractText($, root, ['.MUxGbd', '.location', '.fMYBhe']),
        category: extractText($, root, ['.YrbPuc', '.category', '.OSrXXb']),
        profileUrl: normalizeUrl(extractAttr($, root, ['a[href^="http"]'])),
      }, 'google_search', parserVersion, fingerprint);
    },
  });
}
