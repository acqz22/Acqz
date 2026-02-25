import {
  fetchHtmlWithZenrows,
  normalizeAdapterError,
  resolveLocation,
  resolveQuery,
  toMaxLeads,
} from './shared.js';

export function createWebAdapter({
  platform,
  buildTargetUrl,
  parseLeads,
  zenParams = '&js_render=true&premium_proxy=true&antibot=true',
}) {
  return {
    platform,
    async searchLeads(input) {
      try {
        const query = resolveQuery(input);
        const location = resolveLocation(input);
        const maxLeads = toMaxLeads(input.maxLeadsPerPlatform);

        const targetUrl = buildTargetUrl({ query, location, input });
        const html = await fetchHtmlWithZenrows({
          targetUrl,
          zenrowsKey: input.zenrowsKey,
          zenParams,
        });

        return parseLeads({ html, query, location, input, maxLeads, platform });
      } catch (error) {
        return [normalizeAdapterError(platform, error)];
      }
    },
  };
}
