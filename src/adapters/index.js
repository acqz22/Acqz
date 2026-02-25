import { BaseAdapter } from './baseAdapter.js';

const adapterConfigs = {
  instagram: (keyword) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(keyword)}`,
  facebook: (keyword) => `https://www.facebook.com/search/pages?q=${encodeURIComponent(keyword)}`,
  linkedin: (keyword) => `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(keyword)}`,
  google_maps: (keyword, location) => `https://www.google.com/maps/search/${encodeURIComponent(`${keyword} ${location}`)}`,
  google_ads_transparency: (keyword, location) => `https://adstransparency.google.com/?region=anywhere&term=${encodeURIComponent(`${keyword} ${location}`)}`,
  meta_ads_library: (keyword) => `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(keyword)}`,
  x: (keyword) => `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query`,
  tiktok: (keyword) => `https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}`,
  yellowpages: (keyword, location) => `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(keyword)}&geo_location_terms=${encodeURIComponent(location)}`,
  justdial: (keyword, location) => `https://www.justdial.com/${encodeURIComponent(location)}/${encodeURIComponent(keyword)}`,
};

export function getAdapter(platform) {
  const buildUrl = adapterConfigs[platform];
  if (!buildUrl) {
    throw new Error(`No adapter configured for platform: ${platform}`);
  }
  return new BaseAdapter({ name: platform, buildUrl });
}
