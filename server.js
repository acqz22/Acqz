import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

const jobs = new Map();

function validateLeadRequest(body = {}) {
  const errors = [];
  const { platforms, location, input = {} } = body;

  if (!platforms || (Array.isArray(platforms) && platforms.length === 0)) {
    errors.push({ field: 'platforms', message: 'platforms is required' });
  }

  const resolvedLocation = location || input.location;
  if (!resolvedLocation) {
    errors.push({ field: 'location', message: 'location or input.location is required' });
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      platforms,
      location: resolvedLocation,
      search: body.search || input.niche || input.search || 'restaurant',
      maxLeadsPerPlatform: body.maxLeadsPerPlatform ?? 40,
      input,
    },
  };
}

function createJob(payload) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const job = {
    id,
    status: 'queued',
    createdAt: new Date().toISOString(),
    payload,
    result: null,
    error: null,
  };
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id);
}

async function handleMcpRequest(body = {}) {
  const { action = 'health' } = body;
  if (action === 'health') {
    return {
      success: true,
      service: 'Acqz Lead Engine',
      version: '2.0.0',
      endpoints: ['/jobs', '/jobs/:id', '/mcp', '/scrape'],
    };
  }
  return { success: false, error: `Unsupported MCP action: ${action}` };
}

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

async function runScrape(payload) {
  const startTime = Date.now();
  let { platforms, maxLeadsPerPlatform = 40, search, location, input = {} } = payload;

  const resolvedLocation = location || input.location;
  if (!platforms || !resolvedLocation || !ZENROWS_KEY) {
    return {
      success: false,
      error: 'Missing platforms / location / ZENROWS_API_KEY',
    };
  }

  if (typeof platforms === 'string') platforms = [platforms];

  const resolvedQuery = search || input.niche || input.search || 'restaurant';

  const resultsByPlatform = {};
  let totalLeads = 0;
  const parsedMax = Number.parseInt(maxLeadsPerPlatform, 10);
  const maxThis = Number.isNaN(parsedMax) ? 40 : Math.min(Math.max(parsedMax, 1), 80);

  console.log(`[START] Platforms: ${platforms} | Search: ${resolvedQuery} | Location: ${resolvedLocation}`);

  for (const platform of platforms) {
    const rawPlatform = String(platform || '').trim();
    const platformId = rawPlatform.toLowerCase();
    const resultKey = rawPlatform || platformId || 'unknown';
    let results = [];

    try {
      let zenParams = '&js_render=true&premium_proxy=true&antibot=true';
      const targetUrl = buildTargetUrl(platformId, resolvedQuery, resolvedLocation);
      if (platformId === 'google_maps') zenParams = '&js_render=true';

      console.log(`[FETCH] ${resultKey} → ${targetUrl}`);

      const zenUrl = buildZenrowsUrl(targetUrl, zenParams);
      const { data: html } = await axios.get(zenUrl, { timeout: 40000 });
      const $ = load(html);

      if (platformId.startsWith('google')) {
        $('.g, .Nv2G9d, .fontHeadlineSmall, .section-result, [jsname]').each((i, el) => {
          if (results.length >= maxThis) return false;
          const title = $(el).find('h3, .fontHeadlineSmall, .name').text().trim() || $(el).text().split('\n')[0];
          const link = $(el).find('a').attr('href') || '';
          const phone = $(el).text().match(/(\+?\d[\d\s\-\(\)]{8,})/)?.[0] || '';
          const address = $(el).find('.VwiC3b, .address').text().trim();
          if (title && title.length > 3) results.push({ title, link, phone, address, source: resultKey });
        });
      } else if (platformId === 'yellowpages' || platformId === 'justdial') {
        $('.result, .jdgm-listing').each((i, el) => {
          if (results.length >= maxThis) return false;
          results.push({
            title: $(el).find('.business-name, .jdgm-listing-name, .store-name').text().trim(),
            phone: $(el).find('.phones, .jdgm-phone, .phone').text().trim(),
            address: $(el).find('.street-address, .adr').text().trim(),
            source: resultKey,
          });
        });
      } else {
        $('a, h1, h2, span').each((i, el) => {
          if (results.length >= maxThis) return false;
          const text = $(el).text().trim();
          if (text.length > 5 && (text.includes('@') || text.match(/\d{10}/) || text.length < 50)) {
            results.push({ name: text, source: resultKey });
          }
        });
      }

      console.log(`[RESULT] ${resultKey} → Found ${results.length} leads`);

      resultsByPlatform[resultKey] = results.length ? results : [{ note: `${resultKey} - no public leads visible` }];
      totalLeads += results.length;
    } catch (e) {
      console.error(`[ERROR] ${resultKey}:`, e.message);
      resultsByPlatform[resultKey] = [{ error: e.message }];
    }
  }

  return {
    success: true,
    raw_leads: Object.values(resultsByPlatform).flat(),
    totalLeads,
    durationMs: Date.now() - startTime,
    results: resultsByPlatform,
    platformsUsed: platforms,
  };
}

app.get('/', (req, res) => {
  res.json({
    service: 'Acqz Lead Engine',
    version: '2.0.0',
    endpoints: ['/jobs', '/jobs/:id', '/mcp', '/scrape'],
  });
});

app.post('/scrape', async (req, res) => {
  const response = await runScrape(req.body);
  if (!response.success) return res.status(400).json(response);
  return res.json(response);
});

app.post('/jobs', async (req, res) => {
  const validation = validateLeadRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const job = createJob(validation.normalized);
  res.status(202).json({ success: true, jobId: job.id, status: job.status });

  runScrape(validation.normalized)
    .then((result) => {
      const stored = getJob(job.id);
      if (!stored) return;
      stored.status = result.success ? 'completed' : 'failed';
      stored.result = result.success ? result : null;
      stored.error = result.success ? null : result.error;
      stored.completedAt = new Date().toISOString();
    })
    .catch((error) => {
      const stored = getJob(job.id);
      if (!stored) return;
      stored.status = 'failed';
      stored.error = error.message;
      stored.completedAt = new Date().toISOString();
    });
});

app.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  return res.json({ success: true, job });
});

app.post('/mcp', async (req, res) => {
  const response = await handleMcpRequest(req.body);
  res.json(response);
});

const port = Number.parseInt(process.env.PORT, 10) || 10000;
app.listen(port, () => console.log(`Acqz Lead Engine listening on port ${port}`));
