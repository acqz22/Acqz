import instagramAdapter from '../adapters/instagramAdapter.js';
import facebookAdapter from '../adapters/facebookAdapter.js';
import linkedinAdapter from '../adapters/linkedinAdapter.js';
import googleMapsAdapter from '../adapters/google_mapsAdapter.js';
import googleAdsTransparencyAdapter from '../adapters/google_ads_transparencyAdapter.js';
import metaAdsLibraryAdapter from '../adapters/meta_ads_libraryAdapter.js';
import xAdapter from '../adapters/xAdapter.js';
import tiktokAdapter from '../adapters/tiktokAdapter.js';
import yellowpagesAdapter from '../adapters/yellowpagesAdapter.js';
import justdialAdapter from '../adapters/justdialAdapter.js';

const adapters = new Map([
  ['instagram', instagramAdapter],
  ['facebook', facebookAdapter],
  ['linkedin', linkedinAdapter],
  ['google_maps', googleMapsAdapter],
  ['google_ads_transparency', googleAdsTransparencyAdapter],
  ['meta_ads_library', metaAdsLibraryAdapter],
  ['x', xAdapter],
  ['tiktok', tiktokAdapter],
  ['yellowpages', yellowpagesAdapter],
  ['justdial', justdialAdapter],
  // Backward-compatible aliases.
  ['google_ads', googleAdsTransparencyAdapter],
  ['google_search', googleAdsTransparencyAdapter],
  ['meta_ads', metaAdsLibraryAdapter],
  ['twitter', xAdapter],
]);

export function getAdapter(platform) {
  const adapter = adapters.get(platform);

  if (!adapter) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return adapter;
}
