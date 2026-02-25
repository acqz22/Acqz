import express from 'express';
import cors from 'cors';
import { getAdapter } from './src/adapters/platformAdapters.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

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
  const maxThis = Math.min(parseInt(maxLeadsPerPlatform, 10), 80);

  console.log(`[START] Platforms: ${platforms} | Search: ${search} | Location: ${location}`);

  for (const platform of platforms) {
    try {
      const query = search || input.niche || input.search || 'restaurant';
      const loc = location || input.location || 'Bangalore, India';
      const adapter = getAdapter(platform, { zenrowsApiKey: ZENROWS_KEY });
      const results = await adapter.scrape({ query, location: loc, maxLeads: maxThis });

      console.log(`[RESULT] ${platform} → Found ${results.length} leads`);
      resultsByPlatform[platform] = results.length ? results : [{ note: `${platform} - no public leads visible` }];
      totalLeads += results.length;
    } catch (e) {
      console.error(`[ERROR] ${platform}:`, e.message);
      resultsByPlatform[platform] = [{ error: e.message }];
    }
  }

  res.json({
    success: true,
    raw_leads: Object.values(resultsByPlatform).flat(),
    totalLeads,
    durationMs: Date.now() - startTime,
    results: resultsByPlatform,
    platformsUsed: platforms,
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log('✅ ACQZ Scraper adapter parser build live'));
