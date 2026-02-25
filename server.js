import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { parsePlatformHtml } from './src/parsers.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

app.get('/', (_req, res) => res.send('<h1>🚀 ACQZ Lead Scraper – 100% Clean & Workflow Ready</h1>'));

function buildTargetUrl(platform, query, location) {
  switch (platform) {
    case 'google_maps':
      return {
        url: `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${location}`)}`,
        zenParams: '&js_render=true'
      };
    case 'instagram':
      return { url: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}` };
    case 'linkedin':
      return { url: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}` };
    case 'facebook':
      return { url: `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}` };
    case 'meta_ads':
      return { url: `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}` };
    case 'google_ads':
    case 'google_search':
      return { url: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}` };
    case 'youtube':
      return { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` };
    case 'twitter':
      return { url: `https://twitter.com/explore?q=${encodeURIComponent(query)}` };
    case 'yellowpages':
      return {
        url: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`
      };
    case 'justdial':
      return { url: `https://www.justdial.com/${encodeURIComponent(location)}/${encodeURIComponent(query)}` };
    case 'tiktok':
      return { url: `https://www.tiktok.com/search?q=${encodeURIComponent(query)}` };
    default:
      return { url: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}` };
  }
}

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  let { platforms, maxLeadsPerPlatform = 40, search, location, input = {} } = req.body;

  if (!platforms || !location || !ZENROWS_KEY) {
    return res.status(400).json({ success: false, error: 'Missing platforms / location / ZENROWS_API_KEY' });
  }
  if (typeof platforms === 'string') platforms = [platforms];

  const resultsByPlatform = {};
  let totalLeads = 0;
  const maxThis = Math.min(parseInt(maxLeadsPerPlatform, 10), 80);

  console.log(`[START] Platforms: ${platforms} | Search: ${search} | Location: ${location}`);

  for (const platform of platforms) {
    try {
      const query = search || input.niche || input.search || 'restaurant';
      const loc = location || input.location || 'Bangalore, India';
      const { url: targetUrl, zenParams = '&js_render=true&premium_proxy=true&antibot=true' } = buildTargetUrl(platform, query, loc);

      console.log(`[FETCH] ${platform} → ${targetUrl}`);

      const zenUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(targetUrl)}${zenParams}`;
      const { data: html } = await axios.get(zenUrl, { timeout: 40000 });

      const parsed = parsePlatformHtml(platform, html, { maxLeads: maxThis });

      console.log(
        `[RESULT] ${platform} → Found ${parsed.leads.length} leads (adapter=${parsed.adapter} selectors=${parsed.selectorSetVersion})`
      );

      resultsByPlatform[platform] = {
        adapter: parsed.adapter,
        selectorSetVersion: parsed.selectorSetVersion,
        leads: parsed.leads.length ? parsed.leads : [{ note: `${platform} - no public leads visible` }]
      };
      totalLeads += parsed.leads.length;
    } catch (e) {
      console.error(`[ERROR] ${platform}:`, e.message);
      resultsByPlatform[platform] = {
        adapter: 'error',
        selectorSetVersion: 'n/a',
        leads: [{ error: e.message }]
      };
    }
  }

  const rawLeads = Object.values(resultsByPlatform).flatMap((entry) => entry.leads || []);

  res.json({
    success: true,
    raw_leads: rawLeads,
    totalLeads,
    durationMs: Date.now() - startTime,
    results: resultsByPlatform,
    platformsUsed: platforms
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log('✅ ACQZ Scraper v5 LIVE – parser adapters enabled'));
