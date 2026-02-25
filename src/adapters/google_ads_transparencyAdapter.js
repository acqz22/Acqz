import { createWebAdapter } from './createWebAdapter.js';
import { parseGoogleLikeLeads } from './shared.js';

export default createWebAdapter({
  platform: 'google_ads_transparency',
  buildTargetUrl: ({ query, location }) => `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseGoogleLikeLeads(html, platform, maxLeads),
});
