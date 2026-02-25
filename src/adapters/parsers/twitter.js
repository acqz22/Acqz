import { buildLead, extractAttr, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'twitter@1.0.0';

export function parseTwitter($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['[data-testid="UserCell"]', 'article', 'div[role="listitem"]'],
    buildRecord: (root) => {
      const handle = extractText($, root, ['a[href^="/"] span', '[dir="ltr"]']) || '';
      return buildLead({
        businessName: extractText($, root, ['[data-testid="UserName"] span', 'span']) || handle.replace('@', ''),
        category: 'social_profile',
        profileUrl: normalizeUrl(`https://twitter.com/${handle.replace('@', '')}`),
      }, 'twitter', parserVersion, fingerprint);
    },
  });
}
