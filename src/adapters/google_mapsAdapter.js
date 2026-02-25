import { createWebAdapter } from './createWebAdapter.js';
import { parseGoogleLikeLeads } from './shared.js';

export default createWebAdapter({
  platform: 'google_maps',
  zenParams: '&js_render=true',
  buildTargetUrl: ({ query, location }) => `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${location}`)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseGoogleLikeLeads(html, platform, maxLeads),
});
