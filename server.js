import express from 'express';
import cors from 'cors';
import { runJob } from './src/orchestration/jobOrchestrator.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

app.get('/', (req, res) => res.send('<h1>🚀 ACQZ Lead Scraper – 100% Clean & Workflow Ready</h1>'));

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  const {
    platforms,
    maxLeadsPerPlatform = 40,
    search,
    location,
    input = {},
    rankedKeywords,
    orchestration = {},
  } = req.body;

  if (!platforms || !location || !ZENROWS_KEY) {
    return res.status(400).json({ success: false, error: 'Missing platforms / location / ZENROWS_API_KEY' });
  }

  const effectivePlatforms = typeof platforms === 'string' ? [platforms] : platforms;
  const normalizedKeywords = rankedKeywords || input.rankedKeywords || [search || input.niche || input.search || 'restaurant'];
  const effectiveLocation = location || input.location || 'Bangalore, India';

  try {
    const result = await runJob({
      platforms: effectivePlatforms,
      location: effectiveLocation,
      search,
      rankedKeywords: normalizedKeywords,
      maxLeadsPerPlatform,
      zenrowsApiKey: ZENROWS_KEY,
      config: orchestration,
    });

    res.json({
      success: true,
      raw_leads: result.rawLeads,
      totalLeads: result.totalLeads,
      durationMs: Date.now() - startTime,
      results: result.resultsByPlatform,
      platformsUsed: result.platformsUsed,
      jobMeta: result.metadata,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run scrape job',
      durationMs: Date.now() - startTime,
    });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log('✅ ACQZ Scraper LIVE'));
