import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'cheerio';

import { parseFacebook } from '../src/adapters/parsers/facebook.js';
import { parseGoogleAds } from '../src/adapters/parsers/googleAds.js';
import { parseGoogleMaps } from '../src/adapters/parsers/googleMaps.js';
import { parseGoogleSearch } from '../src/adapters/parsers/googleSearch.js';
import { parseInstagram } from '../src/adapters/parsers/instagram.js';
import { parseJustdial } from '../src/adapters/parsers/justdial.js';
import { parseLinkedIn } from '../src/adapters/parsers/linkedin.js';
import { parseMetaAds } from '../src/adapters/parsers/metaAds.js';
import { parseTikTok } from '../src/adapters/parsers/tiktok.js';
import { parseTwitter } from '../src/adapters/parsers/twitter.js';
import { parseYellowPages } from '../src/adapters/parsers/yellowpages.js';
import { parseYouTube } from '../src/adapters/parsers/youtube.js';

const parserMap = {
  google_maps: parseGoogleMaps,
  google_search: parseGoogleSearch,
  google_ads: parseGoogleAds,
  instagram: parseInstagram,
  linkedin: parseLinkedIn,
  facebook: parseFacebook,
  meta_ads: parseMetaAds,
  youtube: parseYouTube,
  twitter: parseTwitter,
  yellowpages: parseYellowPages,
  justdial: parseJustdial,
  tiktok: parseTikTok,
};

for (const [platform, parser] of Object.entries(parserMap)) {
  test(`${platform} parser extracts normalized fields`, () => {
    const fixtureDir = join(process.cwd(), 'tests', 'fixtures', platform);
    const html = readFileSync(join(fixtureDir, 'sample.html'), 'utf8');
    const expected = JSON.parse(readFileSync(join(fixtureDir, 'expected.json'), 'utf8'));
    const leads = parser(load(html), { maxLeads: 3, fingerprint: { hash: 'fixture' } });

    assert.ok(leads.length >= 1);
    const lead = leads[0];
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(lead[key], value, `Mismatch for ${platform}:${key}`);
    }
    assert.ok(lead.parserVersion);
    assert.deepEqual(lead.fingerprint, { hash: 'fixture' });
  });
}
