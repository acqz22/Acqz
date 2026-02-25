import { createWebAdapter } from './createWebAdapter.js';
import { parseSocialLeads } from './shared.js';

export default createWebAdapter({
  platform: 'meta_ads_library',
  buildTargetUrl: ({ query }) => `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseSocialLeads(html, platform, maxLeads),
});
