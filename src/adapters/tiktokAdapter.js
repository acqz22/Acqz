import { createWebAdapter } from './createWebAdapter.js';
import { parseSocialLeads } from './shared.js';

export default createWebAdapter({
  platform: 'tiktok',
  buildTargetUrl: ({ query }) => `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseSocialLeads(html, platform, maxLeads),
});
