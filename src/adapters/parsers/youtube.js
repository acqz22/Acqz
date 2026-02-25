import { buildLead, extractAttr, extractText, normalizeUrl, parseBySelectorChain } from './utils.js';

export const parserVersion = 'youtube@1.0.0';

export function parseYouTube($, { maxLeads, fingerprint }) {
  return parseBySelectorChain({
    $,
    maxLeads,
    containerSelectors: ['ytd-video-renderer', '.ytd-video-renderer', '.yt-lockup-view-model'],
    buildRecord: (root) => buildLead({
      businessName: extractText($, root, ['#channel-name', '.ytd-channel-name a', '.channel-name']),
      website: normalizeUrl(extractAttr($, root, ['#video-title', 'a[href*="watch?v="]'])),
      location: '',
      category: extractText($, root, ['#metadata-line span:first', '.video-metadata']),
      profileUrl: normalizeUrl(extractAttr($, root, ['#channel-name', 'a[href*="/@"]'])),
    }, 'youtube', parserVersion, fingerprint),
  });
}
