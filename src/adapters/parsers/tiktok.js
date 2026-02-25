import { buildLead, extractAttr, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'tiktok@1.0.0';

export function parseTikTok($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['.search-user-card', '[data-e2e="search-user-item"]', 'a[href^="/@"]'],
    buildRecord: (root) => {
      const handle = extractText($, root, ['.user-name', '[data-e2e="search-user-unique-id"]', 'span']) || root.text().trim();
      const href = extractAttr($, root, ['a[href^="/@"]']) || root.attr('href') || '';
      return buildLead({
        businessName: handle.replace('@', ''),
        category: 'social_profile',
        profileUrl: normalizeUrl(`https://www.tiktok.com${href}`),
      }, 'tiktok', parserVersion, fingerprint);
    },
  });
}
