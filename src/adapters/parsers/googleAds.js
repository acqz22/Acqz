import { parserVersion, parseGoogleSearch } from './googleSearch.js';

export const adsParserVersion = `google_ads->${parserVersion}`;

export function parseGoogleAds($, context) {
  return parseGoogleSearch($, context).map((lead) => ({
    ...lead,
    source: 'google_ads',
    parserVersion: adsParserVersion,
  }));
}
