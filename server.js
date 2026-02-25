import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

function buildTargetUrl(platform, query, loc) {
  const platformId = String(platform || '').trim().toLowerCase();
  const safeQuery = String(query || '').trim();
  const safeLoc = String(loc || '').trim();

  const encodedQuery = encodeURIComponent(safeQuery);
  const encodedLoc = encodeURIComponent(safeLoc);
  const encodedQueryWithLoc = encodeURIComponent(`${safeQuery} ${safeLoc}`.trim());

  switch (platformId) {
    case 'google_maps':
      return `https://www.google.com/maps/search/${encodedQueryWithLoc}`;
    case 'instagram':
      return `https://www.instagram.com/explore/search/keyword/?q=${encodedQuery}`;
    case 'linkedin':
      return `https://www.linkedin.com/search/results/companies/?keywords=${encodedQuery}`;
    case 'facebook':
      return `https://www.facebook.com/search/pages?q=${encodedQuery}`;
    case 'meta_ads':
      return `https://www.facebook.com/ads/library/?q=${encodedQuery}`;
    case 'google_ads':
    case 'google_search':
      return `https://www.google.com/search?q=${encodedQueryWithLoc}`;
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${encodedQuery}`;
    case 'twitter':
      return `https://twitter.com/explore?q=${encodedQuery}`;
    case 'yellowpages':
      return `https://www.yellowpages.com/search?search_terms=${encodedQuery}&geo_location_terms=${encodedLoc}`;
    case 'justdial':
      return `https://www.justdial.com/${encodedLoc}/${encodedQuery}`;
    case 'tiktok':
      return `https://www.tiktok.com/search?q=${encodedQuery}`;
    default:
      return `https://www.google.com/search?q=${encodedQueryWithLoc}`;
  }
}

function buildZenrowsUrl(targetUrl, zenParams = '') {
  const url = new URL('https://api.zenrows.com/v1/');
  url.searchParams.set('apikey', ZENROWS_KEY);
  url.searchParams.set('url', targetUrl);

  const extraParams = new URLSearchParams((zenParams || '').replace(/^&/, ''));
  extraParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

app.get('/', (req, res) => res.send('<h1>🚀 ACQZ Lead Scraper – 100% Clean & Workflow Ready</h1>'));

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  let { platforms, maxLeadsPerPlatform = 40, search, location, input = {} } = req.body;

  if (!platforms || !location || !ZENROWS_KEY) {
    return res.status(400).json({ success: false, error: 'Missing platforms / location / ZENROWS_API_KEY' });
  }
  if (typeof platforms === 'string') platforms = [platforms];

  const resultsByPlatform = {};
  let totalLeads = 0;
  const parsedMax = Number.parseInt(maxLeadsPerPlatform, 10);
  const maxThis = Number.isNaN(parsedMax) ? 40 : Math.min(parsedMax, 80);

  console.log(`[START] Platforms: ${platforms} | Search: ${search} | Location: ${location}`);

  for (const platform of platforms) {
    const platformId = String(platform || '').trim().toLowerCase();
    let results = [];
    try {
      let zenParams = '&js_render=true&premium_proxy=true&antibot=true';

      const query = search || input.niche || input.search || 'restaurant';
      const loc = location || input.location || 'Bangalore, India';

      const targetUrl = buildTargetUrl(platformId, query, loc);
      if (platformId === 'google_maps') zenParams = '&js_render=true';

      console.log(`[FETCH] ${platformId} → ${targetUrl}`);

      const zenUrl = buildZenrowsUrl(targetUrl, zenParams);
      const { data: html } = await axios.get(zenUrl, { timeout: 40000 });
      const $ = load(html);

      // Stronger 2026 parsing
      if (platformId.startsWith('google')) {
        $('.g, .Nv2G9d, .fontHeadlineSmall, .section-result, [jsname]').each((i, el) => {
          if (results.length >= maxThis) return false;
          const title = $(el).find('h3, .fontHeadlineSmall, .name').text().trim() || $(el).text().split('\n')[0];
          const link = $(el).find('a').attr('href') || '';
          const phone = $(el).text().match(/(\+?\d[\d\s\-\(\)]{8,})/)?.[0] || '';
          const address = $(el).find('.VwiC3b, .address').text().trim();
          if (title && title.length > 3) results.push({ title, link, phone, address, source: platformId });
        });
      } else if (platformId === 'yellowpages' || platformId === 'justdial') {
        $('.result, .jdgm-listing').each((i, el) => {
          if (results.length >= maxThis) return false;
          results.push({
            title: $(el).find('.business-name, .jdgm-listing-name, .store-name').text().trim(),
            phone: $(el).find('.phones, .jdgm-phone, .phone').text().trim(),
            address: $(el).find('.street-address, .adr').text().trim(),
            source: platformId
          });
        });
      } else {
        // Social fallback
        $('a, h1, h2, span').each((i, el) => {
          if (results.length >= maxThis) return false;
          const text = $(el).text().trim();
          if (text.length > 5 && (text.includes('@') || text.match(/\d{10}/) || text.length < 50)) {
            results.push({ name: text, source: platformId });
          }
        });
      }

      console.log(`[RESULT] ${platformId} → Found ${results.length} leads`);

      resultsByPlatform[platformId] = results.length ? results : [{ note: `${platformId} - no public leads visible` }];
      totalLeads += results.length;

    } catch (e) {
      console.error(`[ERROR] ${platformId}:`, e.message);
      resultsByPlatform[platformId] = [{ error: e.message }];
    }
  }

  // IMPORTANT: Return format that matches your "Normalize All Raw Results" node
  res.json({
    success: true,
    raw_leads: Object.values(resultsByPlatform).flat(),   // flat array for your workflow
    totalLeads,
    durationMs: Date.now() - startTime,
    results: resultsByPlatform,
    platformsUsed: platforms
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log('✅ ACQZ Scraper v4 LIVE – 100% Clean'));
