import { createWebAdapter } from './createWebAdapter.js';
import { parseSocialLeads } from './shared.js';

export default createWebAdapter({
  platform: 'x',
  buildTargetUrl: ({ query }) => `https://twitter.com/explore?q=${encodeURIComponent(query)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseSocialLeads(html, platform, maxLeads),
});
