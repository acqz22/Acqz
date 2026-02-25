import crypto from 'crypto';
import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;
const PORT = Number(process.env.PORT || 10000);
const DEFAULT_MAX_LEADS = Number(process.env.DEFAULT_MAX_LEADS || 40);
const MAX_LEADS_CAP = Number(process.env.MAX_LEADS_CAP || 80);
const DEFAULT_PLATFORM_CONCURRENCY = Number(process.env.PLATFORM_CONCURRENCY || 2);
const MAX_RETRIES = Number(process.env.PLATFORM_TASK_MAX_RETRIES || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS || 700);
const RETRY_MAX_DELAY_MS = Number(process.env.RETRY_MAX_DELAY_MS || 8000);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 1000 * 60 * 60 * 6);
const WEBHOOK_SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET;

const jobs = new Map();
const platformWorkers = new Map();

const TRANSIENT_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const normalizePlatforms = (platforms) => {
  if (!platforms) return [];
  if (Array.isArray(platforms)) return platforms;
  if (typeof platforms === 'string') return [platforms];
  return [];
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const computeBackoffDelay = (attempt) => {
  const exponential = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential * 0.25)));
  return Math.min(RETRY_MAX_DELAY_MS, exponential + jitter);
};

const isTransientError = (error) => {
  if (error.code && ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code)) {
    return true;
  }
  const status = error.response?.status;
  return status ? TRANSIENT_HTTP_STATUS.has(status) : false;
};

const createJob = (payload) => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const platforms = normalizePlatforms(payload.platforms);
  const maxLeadsPerPlatform = Math.min(Number(payload.maxLeadsPerPlatform) || DEFAULT_MAX_LEADS, MAX_LEADS_CAP);

  const job = {
    id,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    callbackUrl: payload.callbackUrl || null,
    request: {
      platforms,
      search: payload.search,
      location: payload.location,
      input: payload.input || {},
      maxLeadsPerPlatform
    },
    progress: {
      total: platforms.length,
      pending: platforms.length,
      running: 0,
      completed: 0,
      failed: 0,
      percent: platforms.length ? 0 : 100
    },
    results: {},
    attempts: {},
    errors: [],
    totalLeads: 0,
    durationMs: 0
  };

  jobs.set(id, job);
  return job;
};

const markJobUpdate = (job) => {
  job.updatedAt = new Date().toISOString();
  const done = job.progress.completed + job.progress.failed;
  job.progress.percent = job.progress.total ? Math.round((done / job.progress.total) * 100) : 100;
};

const getQueryAndLocation = (task) => {
  const query = task.search || task.input?.niche || task.input?.search || 'restaurant';
  const loc = task.location || task.input?.location || 'Bangalore, India';
  return { query, loc };
};

const buildTargetUrl = (platform, task) => {
  const { query, loc } = getQueryAndLocation(task);

  switch (platform) {
    case 'google_maps':
      return {
        targetUrl: `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${loc}`)}`,
        zenParams: '&js_render=true'
      };
    case 'instagram':
      return { targetUrl: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}` };
    case 'linkedin':
      return { targetUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}` };
    case 'facebook':
      return { targetUrl: `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}` };
    case 'meta_ads':
      return { targetUrl: `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}` };
    case 'google_ads':
    case 'google_search':
      return { targetUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${loc}`)}` };
    case 'youtube':
      return { targetUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` };
    case 'twitter':
      return { targetUrl: `https://twitter.com/explore?q=${encodeURIComponent(query)}` };
    case 'yellowpages':
      return {
        targetUrl: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(loc)}`
      };
    case 'justdial':
      return { targetUrl: `https://www.justdial.com/${encodeURIComponent(loc)}/${encodeURIComponent(query)}` };
    case 'tiktok':
      return { targetUrl: `https://www.tiktok.com/search?q=${encodeURIComponent(query)}` };
    default:
      return { targetUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${loc}`)}` };
  }
};

const parseResultsForPlatform = (platform, html, maxLeadsPerPlatform) => {
  const $ = load(html);
  const results = [];

  if (platform.includes('google')) {
    $('.g, .Nv2G9d, .fontHeadlineSmall, .section-result, [jsname]').each((_, el) => {
      if (results.length >= maxLeadsPerPlatform) return false;
      const title = $(el).find('h3, .fontHeadlineSmall, .name').text().trim() || $(el).text().split('\n')[0]?.trim();
      const link = $(el).find('a').attr('href') || '';
      const phone = $(el).text().match(/(\+?\d[\d\s\-\(\)]{8,})/)?.[0] || '';
      const address = $(el).find('.VwiC3b, .address').text().trim();
      if (title && title.length > 3) {
        results.push({ title, link, phone, address, source: platform });
      }
    });
  } else if (platform === 'yellowpages' || platform === 'justdial') {
    $('.result, .jdgm-listing').each((_, el) => {
      if (results.length >= maxLeadsPerPlatform) return false;
      results.push({
        title: $(el).find('.business-name, .jdgm-listing-name, .store-name').text().trim(),
        phone: $(el).find('.phones, .jdgm-phone, .phone').text().trim(),
        address: $(el).find('.street-address, .adr').text().trim(),
        source: platform
      });
    });
  } else {
    $('a, h1, h2, span').each((_, el) => {
      if (results.length >= maxLeadsPerPlatform) return false;
      const text = $(el).text().trim();
      if (text.length > 5 && (text.includes('@') || /\d{10}/.test(text) || text.length < 50)) {
        results.push({ name: text, source: platform });
      }
    });
  }

  return results;
};

const fetchPlatformResults = async (platform, task) => {
  if (!ZENROWS_KEY) {
    const configError = new Error('ZENROWS_API_KEY is not configured');
    configError.nonRetryable = true;
    throw configError;
  }

  const { targetUrl, zenParams = '&js_render=true&antibot=true' } = buildTargetUrl(platform, task);
  const zenUrl = `https://api.zenrows.com/v1/?apikey=${encodeURIComponent(ZENROWS_KEY)}&url=${encodeURIComponent(targetUrl)}${zenParams}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const { data: html } = await axios.get(zenUrl, { timeout: 40000 });
      return { records: parseResultsForPlatform(platform, html, task.maxLeadsPerPlatform), attemptsUsed: attempt };
    } catch (error) {
      if (attempt >= MAX_RETRIES || error.nonRetryable || !isTransientError(error)) {
        throw error;
      }
      await sleep(computeBackoffDelay(attempt));
    }
  }

  return [];
};

const createWebhookSignature = (payload, timestamp) => {
  if (!WEBHOOK_SIGNING_SECRET) return null;
  return crypto.createHmac('sha256', WEBHOOK_SIGNING_SECRET).update(`${timestamp}.${payload}`).digest('hex');
};

const sendJobWebhook = async (job) => {
  if (!job.callbackUrl) return;

  const body = JSON.stringify({
    event: 'job.completed',
    jobId: job.id,
    status: job.status,
    completedAt: job.completedAt,
    results: job.results,
    totalLeads: job.totalLeads,
    errors: job.errors
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createWebhookSignature(body, timestamp);
  const headers = { 'content-type': 'application/json', 'x-acqz-timestamp': timestamp };
  if (signature) headers['x-acqz-signature'] = signature;

  try {
    await axios.post(job.callbackUrl, body, { headers, timeout: 12000 });
  } catch (error) {
    job.errors.push({
      type: 'webhook_delivery_failed',
      message: error.message,
      status: error.response?.status || null,
      timestamp: new Date().toISOString()
    });
    markJobUpdate(job);
  }
};

const finalizeJobIfDone = async (job) => {
  if (job.progress.pending > 0 || job.progress.running > 0) return;

  job.status = job.progress.failed > 0 ? 'completed_with_errors' : 'completed';
  job.completedAt = new Date().toISOString();
  job.durationMs = new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime();
  markJobUpdate(job);
  await sendJobWebhook(job);
};

const runPlatformTask = async (jobId, platform) => {
  const job = jobs.get(jobId);
  if (!job) return;

  if (!job.startedAt) {
    job.startedAt = new Date().toISOString();
    job.status = 'running';
  }

  job.progress.pending -= 1;
  job.progress.running += 1;
  markJobUpdate(job);

  try {
    const { records, attemptsUsed } = await fetchPlatformResults(platform, job.request);
    job.results[platform] = records.length ? records : [{ note: `${platform} - no public leads visible` }];
    job.totalLeads += records.length;
    job.attempts[platform] = attemptsUsed;
    job.progress.completed += 1;
  } catch (error) {
    job.results[platform] = [{ error: error.message }];
    job.errors.push({
      platform,
      message: error.message,
      status: error.response?.status || null,
      code: error.code || null,
      timestamp: new Date().toISOString()
    });
    job.progress.failed += 1;
  } finally {
    job.progress.running -= 1;
    if (!job.attempts[platform]) job.attempts[platform] = MAX_RETRIES;
    markJobUpdate(job);
    await finalizeJobIfDone(job);
  }
};

const getWorkerState = (platform) => {
  if (!platformWorkers.has(platform)) {
    platformWorkers.set(platform, {
      active: 0,
      limit: Number(process.env[`PLATFORM_CONCURRENCY_${platform.toUpperCase()}`]) || DEFAULT_PLATFORM_CONCURRENCY,
      queue: []
    });
  }
  return platformWorkers.get(platform);
};

const pumpWorker = (platform) => {
  const worker = getWorkerState(platform);
  while (worker.active < worker.limit && worker.queue.length > 0) {
    const nextTask = worker.queue.shift();
    worker.active += 1;

    runPlatformTask(nextTask.jobId, platform)
      .catch((error) => {
        console.error(`[WORKER:${platform}] unhandled task error`, error);
      })
      .finally(() => {
        worker.active -= 1;
        pumpWorker(platform);
      });
  }
};

const enqueuePlatformTask = (jobId, platform) => {
  const worker = getWorkerState(platform);
  worker.queue.push({ jobId });
  pumpWorker(platform);
};

const pruneJobs = () => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    const updatedAt = new Date(job.updatedAt).getTime();
    if (now - updatedAt > JOB_TTL_MS) jobs.delete(jobId);
  }
};

setInterval(pruneJobs, 1000 * 60 * 5).unref();

app.get('/', (_req, res) => res.send('<h1>🚀 ACQZ Job Scraper API</h1>'));

app.post('/jobs', (req, res) => {
  const payload = req.body || {};
  const platforms = normalizePlatforms(payload.platforms);

  if (!platforms.length || !payload.location) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: platforms[] and location'
    });
  }

  const job = createJob(payload);

  for (const platform of job.request.platforms) {
    enqueuePlatformTask(job.id, platform);
  }

  return res.status(202).json({ success: true, jobId: job.id, status: job.status });
});

app.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  return res.json({
    success: true,
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationMs: job.durationMs,
    progress: job.progress,
    totalLeads: job.totalLeads,
    results: job.results,
    errors: job.errors
  });
});

// Backward compatibility endpoint: starts async job and immediately returns metadata.
app.post('/scrape', (req, res) => {
  const payload = req.body || {};
  const platforms = normalizePlatforms(payload.platforms);

  if (!platforms.length || !payload.location) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: platforms[] and location'
    });
  }

  const job = createJob(payload);
  for (const platform of job.request.platforms) {
    enqueuePlatformTask(job.id, platform);
  }

  return res.status(202).json({ success: true, jobId: job.id, status: job.status });
});

app.listen(PORT, () => {
  console.log(`✅ ACQZ Job Scraper API listening on :${PORT}`);
});
