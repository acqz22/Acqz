import { createWebAdapter } from './createWebAdapter.js';
import { parseSocialLeads } from './shared.js';

export default createWebAdapter({
  platform: 'linkedin',
  buildTargetUrl: ({ query }) => `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseSocialLeads(html, platform, maxLeads),
});
