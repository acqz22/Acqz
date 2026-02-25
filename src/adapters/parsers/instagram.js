import { buildLead, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'instagram@1.0.0';

export function parseInstagram($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['article a', 'main a[role="link"]', 'a[href^="/"]'],
    buildRecord: (root) => {
      const handle = extractText($, root, ['span', 'div']) || root.text().trim();
      const href = root.attr('href') || '';
      return buildLead({
        businessName: handle.replace(/^@/, ''),
        profileUrl: normalizeUrl(`https://www.instagram.com${href}`),
        category: 'social_profile',
      }, 'instagram', parserVersion, fingerprint);
    },
  });
}
