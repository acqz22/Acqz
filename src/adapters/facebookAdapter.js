import { createWebAdapter } from './createWebAdapter.js';
import { parseSocialLeads } from './shared.js';

export default createWebAdapter({
  platform: 'facebook',
  buildTargetUrl: ({ query }) => `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseSocialLeads(html, platform, maxLeads),
});
