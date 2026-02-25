import { createWebAdapter } from './createWebAdapter.js';
import { parseDirectoryLeads } from './shared.js';

export default createWebAdapter({
  platform: 'justdial',
  buildTargetUrl: ({ query, location }) => `https://www.justdial.com/${encodeURIComponent(location)}/${encodeURIComponent(query)}`,
  parseLeads: ({ html, platform, maxLeads }) => parseDirectoryLeads(html, platform, maxLeads),
});
