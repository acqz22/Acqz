import { BaseAdapter } from './baseAdapter.js';
import { parseFacebook } from './parsers/facebook.js';
import { parseGoogleAds } from './parsers/googleAds.js';
import { parseGoogleMaps } from './parsers/googleMaps.js';
import { parseGoogleSearch } from './parsers/googleSearch.js';
import { parseInstagram } from './parsers/instagram.js';
import { parseJustdial } from './parsers/justdial.js';
import { parseLinkedIn } from './parsers/linkedin.js';
import { parseMetaAds } from './parsers/metaAds.js';
import { parseTikTok } from './parsers/tiktok.js';
import { parseTwitter } from './parsers/twitter.js';
import { parseYellowPages } from './parsers/yellowpages.js';
import { parseYouTube } from './parsers/youtube.js';

const defaultQuery = 'restaurant';
const defaultLocation = 'Bangalore, India';

class PlatformAdapter extends BaseAdapter {
  buildTargetUrl() {
    throw new Error(`buildTargetUrl() not implemented for ${this.platform}`);
  }

  async scrape({ query = defaultQuery, location = defaultLocation, maxLeads = 40 }) {
    const targetUrl = this.buildTargetUrl({ query, location });
    const { $, fingerprint } = await this.fetch(targetUrl);
    return this.parse($, { maxLeads, fingerprint, query, location });
  }
}

class GoogleMapsAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'google_maps', zenParams: '&js_render=true' }); }
  buildTargetUrl({ query, location }) { return `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${location}`)}`; }
  parse($, ctx) { return parseGoogleMaps($, ctx); }
}
class GoogleSearchAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'google_search', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query, location }) { return `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}`; }
  parse($, ctx) { return parseGoogleSearch($, ctx); }
}
class GoogleAdsAdapter extends GoogleSearchAdapter {
  constructor(config) { super(config); this.platform = 'google_ads'; }
  parse($, ctx) { return parseGoogleAds($, ctx); }
}
class InstagramAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'instagram', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query }) { return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseInstagram($, ctx); }
}
class LinkedInAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'linkedin', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query }) { return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseLinkedIn($, ctx); }
}
class FacebookAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'facebook', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query }) { return `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseFacebook($, ctx); }
}
class MetaAdsAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'meta_ads', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query }) { return `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseMetaAds($, ctx); }
}
class YouTubeAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'youtube', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query }) { return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseYouTube($, ctx); }
}
class TwitterAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'twitter', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query }) { return `https://twitter.com/explore?q=${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseTwitter($, ctx); }
}
class YellowPagesAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'yellowpages', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query, location }) { return `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`; }
  parse($, ctx) { return parseYellowPages($, ctx); }
}
class JustdialAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'justdial', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query, location }) { return `https://www.justdial.com/${encodeURIComponent(location)}/${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseJustdial($, ctx); }
}
class TikTokAdapter extends PlatformAdapter {
  constructor(config) { super({ ...config, platform: 'tiktok', zenParams: '&js_render=true&premium_proxy=true&antibot=true' }); }
  buildTargetUrl({ query }) { return `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`; }
  parse($, ctx) { return parseTikTok($, ctx); }
}

const ADAPTERS = {
  google_maps: GoogleMapsAdapter,
  google_search: GoogleSearchAdapter,
  google_ads: GoogleAdsAdapter,
  instagram: InstagramAdapter,
  linkedin: LinkedInAdapter,
  facebook: FacebookAdapter,
  meta_ads: MetaAdsAdapter,
  youtube: YouTubeAdapter,
  twitter: TwitterAdapter,
  yellowpages: YellowPagesAdapter,
  justdial: JustdialAdapter,
  tiktok: TikTokAdapter,
};

export function getAdapter(platform, config) {
  const Adapter = ADAPTERS[platform] ?? GoogleSearchAdapter;
  return new Adapter(config);
}
