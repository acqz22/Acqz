import express from 'express';
import cors from 'cors';
import { getAdapter } from './src/core/adapterFactory.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

app.get('/', (_, res) => {
  res.send('<h1>🚀 ACQZ Lead Scraper – Modular Adapter Architecture</h1>');
});

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  let { platforms, maxLeadsPerPlatform = 40, search, location, input = {} } = req.body;

  if (!platforms || !location || !ZENROWS_KEY) {
    return res.status(400).json({ success: false, error: 'Missing platforms / location / ZENROWS_API_KEY' });
  }

  if (typeof platforms === 'string') {
    platforms = [platforms];
  }

  const resultsByPlatform = {};
  let totalLeads = 0;

  const requestShape = {
    ...input,
    search: search || input.search || input.niche,
    location: location || input.location,
    maxLeadsPerPlatform,
    zenrowsKey: ZENROWS_KEY,
  };

  for (const platform of platforms) {
    try {
      const adapter = getAdapter(platform);
      const results = await adapter.searchLeads({ ...requestShape, platform });

      resultsByPlatform[platform] = results.length ? results : [{ source: platform, note: `${platform} - no public leads visible` }];
      totalLeads += results.filter((lead) => !lead.error).length;
    } catch (error) {
      resultsByPlatform[platform] = [{ source: platform, error: error.message }];
    }
  }

  return res.json({
    success: true,
    raw_leads: Object.values(resultsByPlatform).flat(),
    totalLeads,
    durationMs: Date.now() - startTime,
    results: resultsByPlatform,
    platformsUsed: platforms,
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`✅ ACQZ Scraper LIVE on :${port}`));
