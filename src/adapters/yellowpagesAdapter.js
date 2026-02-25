import { createWebAdapter } from './createWebAdapter.js';
import { parseDirectoryLeads } from './shared.js';

export default createWebAdapter({
  platform: 'yellowpages',
  buildTargetUrl: ({ query, location }) => `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseDirectoryLeads(html, platform, maxLeads),
});
