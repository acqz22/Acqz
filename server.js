import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ADAPTER_VERSION = process.env.ADAPTER_VERSION || 'v5';
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '40000', 10);
const DEAD_LETTER_THRESHOLD = parseInt(process.env.DEAD_LETTER_THRESHOLD || '3', 10);
const DEAD_LETTER_MAX_SIZE = parseInt(process.env.DEAD_LETTER_MAX_SIZE || '500', 10);

const platformFailureState = new Map();
const deadLetterQueue = [];

const metrics = {
  counters: {
    success: 0,
    failure: 0,
    timeout: 0,
    leadsExtracted: 0,
    parserAttempts: 0,
    parserHits: 0,
    deadLettered: 0,
  },
  platform: {},
  uptimeStartedAt: new Date().toISOString(),
};

const createSpanRecorder = () => {
  const durations = {};
  const starts = {};

  return {
    start(name) {
      starts[name] = process.hrtime.bigint();
    },
    end(name) {
      if (!starts[name]) return;
      const diffNs = process.hrtime.bigint() - starts[name];
      durations[name] = Number(diffNs / 1000000n);
      delete starts[name];
    },
    snapshot() {
      return { ...durations };
    },
  };
};

const ensurePlatformMetrics = (platform) => {
  if (!metrics.platform[platform]) {
    metrics.platform[platform] = {
      success: 0,
      failure: 0,
      timeout: 0,
      leadsExtracted: 0,
      parserAttempts: 0,
      parserHits: 0,
      deadLettered: 0,
    };
  }
  return metrics.platform[platform];
};

const incrementMetric = (platform, key, value = 1) => {
  metrics.counters[key] += value;
  const platformMetrics = ensurePlatformMetrics(platform);
  platformMetrics[key] += value;
};

const computeParserHitRatio = ({ parserAttempts, parserHits }) => {
  if (!parserAttempts) return 0;
  return Number((parserHits / parserAttempts).toFixed(4));
};

const logEvent = ({ level = 'info', message, requestId, jobId, platform = 'all', extra = {} }) => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId,
    jobId,
    platform,
    adapterVersion: ADAPTER_VERSION,
    ...extra,
  };

  console.log(JSON.stringify(payload));
};

const getTargetUrl = ({ platform, query, location }) => {
  switch (platform) {
    case 'google_maps':
      return {
        targetUrl: `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${location}`)}`,
        zenParams: '&js_render=true',
      };
    case 'instagram':
      return {
        targetUrl: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'linkedin':
      return {
        targetUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'facebook':
      return {
        targetUrl: `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'meta_ads':
      return {
        targetUrl: `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'google_ads':
    case 'google_search':
      return {
        targetUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}`,
        zenParams: '&js_render=true',
      };
    case 'youtube':
      return {
        targetUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'twitter':
      return {
        targetUrl: `https://twitter.com/explore?q=${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'yellowpages':
      return {
        targetUrl: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'justdial':
      return {
        targetUrl: `https://www.justdial.com/${encodeURIComponent(location)}/${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    case 'tiktok':
      return {
        targetUrl: `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true',
      };
    default:
      return {
        targetUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}`,
        zenParams: '&js_render=true',
      };
  }
};

const parseLeads = ({ platform, $, maxLeads }) => {
  const leads = [];
  let parserAttempts = 0;

  if (platform.includes('google')) {
    $('.g, .Nv2G9d, .fontHeadlineSmall, .section-result, [jsname]').each((_, el) => {
      if (leads.length >= maxLeads) return false;
      parserAttempts += 1;
      const title = $(el).find('h3, .fontHeadlineSmall, .name').text().trim() || $(el).text().split('\n')[0];
      const link = $(el).find('a').attr('href') || '';
      const phone = $(el).text().match(/(\+?\d[\d\s\-\(\)]{8,})/)?.[0] || '';
      const address = $(el).find('.VwiC3b, .address').text().trim();
      if (title && title.length > 3) leads.push({ title, link, phone, address, source: platform });
    });
    return { leads, parserAttempts };
  }

  if (platform === 'yellowpages' || platform === 'justdial') {
    $('.result, .jdgm-listing').each((_, el) => {
      if (leads.length >= maxLeads) return false;
      parserAttempts += 1;
      const title = $(el).find('.business-name, .jdgm-listing-name, .store-name').text().trim();
      const phone = $(el).find('.phones, .jdgm-phone, .phone').text().trim();
      const address = $(el).find('.street-address, .adr').text().trim();
      if (title) leads.push({ title, phone, address, source: platform });
    });
    return { leads, parserAttempts };
  }

  $('a, h1, h2, span').each((_, el) => {
    if (leads.length >= maxLeads) return false;
    parserAttempts += 1;
    const text = $(el).text().trim();
    if (text.length > 5 && (text.includes('@') || /\d{10}/.test(text) || text.length < 50)) {
      leads.push({ name: text, source: platform });
    }
  });

  return { leads, parserAttempts };
};

const normalizeLead = (lead) => ({
  title: lead.title || lead.name || '',
  name: lead.name || lead.title || '',
  link: lead.link || '',
  phone: lead.phone || '',
  address: lead.address || '',
  source: lead.source || 'unknown',
});

const dedupeLeads = (leads) => {
  const seen = new Set();
  const deduped = [];

  for (const lead of leads) {
    const key = `${lead.source}|${lead.title}|${lead.link}|${lead.phone}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(lead);
  }

  return deduped;
};

const markFailure = ({ platform, reason, requestId, jobId, context = {} }) => {
  const current = platformFailureState.get(platform) || { consecutiveFailures: 0, totalFailures: 0 };
  const next = {
    consecutiveFailures: current.consecutiveFailures + 1,
    totalFailures: current.totalFailures + 1,
    lastError: reason,
    lastFailedAt: new Date().toISOString(),
  };

  platformFailureState.set(platform, next);

  if (next.consecutiveFailures >= DEAD_LETTER_THRESHOLD) {
    const deadLetterPayload = {
      requestId,
      jobId,
      platform,
      reason,
      context,
      deadLetteredAt: new Date().toISOString(),
      consecutiveFailures: next.consecutiveFailures,
    };

    deadLetterQueue.push(deadLetterPayload);
    if (deadLetterQueue.length > DEAD_LETTER_MAX_SIZE) deadLetterQueue.shift();

    incrementMetric(platform, 'deadLettered');
    logEvent({
      level: 'error',
      message: 'Platform task moved to dead-letter queue',
      requestId,
      jobId,
      platform,
      extra: deadLetterPayload,
    });
  }
};

const resetFailureState = (platform) => {
  const current = platformFailureState.get(platform);
  if (!current) return;
  platformFailureState.set(platform, {
    ...current,
    consecutiveFailures: 0,
    lastRecoveredAt: new Date().toISOString(),
  });
};

app.use((req, _res, next) => {
  req.requestId = req.header('x-request-id') || crypto.randomUUID();
  next();
});

app.get('/', (req, res) => {
  res.send(`<h1>🚀 ACQZ Lead Scraper – ${ADAPTER_VERSION}</h1><p>requestId=${req.requestId}</p>`);
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', adapterVersion: ADAPTER_VERSION, uptimeStartedAt: metrics.uptimeStartedAt });
});

app.get('/ready', (_req, res) => {
  const checks = {
    zenrowsApiKeyConfigured: Boolean(process.env.ZENROWS_API_KEY),
  };
  const isReady = Object.values(checks).every(Boolean);
  res.status(isReady ? 200 : 503).json({ status: isReady ? 'ready' : 'not_ready', checks, adapterVersion: ADAPTER_VERSION });
});

app.get('/metrics', (_req, res) => {
  const parserHitRatio = computeParserHitRatio(metrics.counters);
  const platforms = Object.fromEntries(
    Object.entries(metrics.platform).map(([platform, platformMetrics]) => [
      platform,
      {
        ...platformMetrics,
        parserHitRatio: computeParserHitRatio(platformMetrics),
      },
    ])
  );

  res.status(200).json({
    adapterVersion: ADAPTER_VERSION,
    counters: {
      ...metrics.counters,
      parserHitRatio,
    },
    platforms,
    deadLetterQueueSize: deadLetterQueue.length,
  });
});

app.get('/dead-letters', (_req, res) => {
  res.status(200).json({ deadLetterQueue });
});

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  let { platforms, maxLeadsPerPlatform = 40, search, location, input = {}, jobId } = req.body;

  if (typeof platforms === 'string') platforms = [platforms];

  const ZENROWS_KEY = process.env.ZENROWS_API_KEY;
  if (!platforms || !location || !ZENROWS_KEY) {
    return res.status(400).json({ success: false, error: 'Missing platforms / location / ZENROWS_API_KEY' });
  }

  const requestId = req.requestId;
  const resolvedJobId = jobId || crypto.randomUUID();
  const maxThis = Math.min(parseInt(maxLeadsPerPlatform, 10) || 40, 80);

  const resultsByPlatform = {};
  const spansByPlatform = {};
  let totalLeads = 0;

  logEvent({
    message: 'Scrape job started',
    requestId,
    jobId: resolvedJobId,
    extra: { platforms, search, location },
  });

  for (const platform of platforms) {
    const spans = createSpanRecorder();
    spansByPlatform[platform] = spans;

    const failureState = platformFailureState.get(platform);
    if (failureState && failureState.consecutiveFailures >= DEAD_LETTER_THRESHOLD) {
      resultsByPlatform[platform] = [{ error: 'platform_in_dead_letter_queue', note: 'Skipped due to repeated failures' }];
      logEvent({
        level: 'warn',
        message: 'Platform skipped: dead-letter threshold reached',
        requestId,
        jobId: resolvedJobId,
        platform,
        extra: failureState,
      });
      continue;
    }

    try {
      const query = search || input.niche || input.search || 'restaurant';
      const loc = location || input.location || 'Bangalore, India';

      const { targetUrl, zenParams } = getTargetUrl({ platform, query, location: loc });
      const zenUrl = `https://api.zenrows.com/v1/?apikey=${encodeURIComponent(ZENROWS_KEY)}&url=${encodeURIComponent(targetUrl)}${zenParams}`;

      logEvent({
        message: 'Platform fetch started',
        requestId,
        jobId: resolvedJobId,
        platform,
        extra: { targetUrl },
      });

      spans.start('fetch');
      const { data: html } = await axios.get(zenUrl, { timeout: REQUEST_TIMEOUT_MS });
      spans.end('fetch');

      spans.start('parse');
      const $ = load(html);
      const { leads: parsedLeads, parserAttempts } = parseLeads({ platform, $, maxLeads: maxThis });
      spans.end('parse');

      spans.start('normalize');
      const normalizedLeads = parsedLeads.map(normalizeLead);
      spans.end('normalize');

      spans.start('dedupe');
      const dedupedLeads = dedupeLeads(normalizedLeads);
      spans.end('dedupe');

      const parserHits = dedupedLeads.length;
      incrementMetric(platform, 'success');
      incrementMetric(platform, 'leadsExtracted', parserHits);
      incrementMetric(platform, 'parserAttempts', parserAttempts);
      incrementMetric(platform, 'parserHits', parserHits);

      resultsByPlatform[platform] = dedupedLeads.length
        ? dedupedLeads
        : [{ note: `${platform} - no public leads visible` }];

      totalLeads += dedupedLeads.length;
      resetFailureState(platform);

      logEvent({
        message: 'Platform scrape completed',
        requestId,
        jobId: resolvedJobId,
        platform,
        extra: {
          extracted: dedupedLeads.length,
          parserAttempts,
          parserHitRatio: computeParserHitRatio({ parserAttempts, parserHits }),
          spansMs: spans.snapshot(),
        },
      });
    } catch (error) {
      const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
      incrementMetric(platform, isTimeout ? 'timeout' : 'failure');

      markFailure({
        platform,
        reason: error.message,
        requestId,
        jobId: resolvedJobId,
        context: { search, location },
      });

      resultsByPlatform[platform] = [{ error: error.message }];

      logEvent({
        level: 'error',
        message: 'Platform scrape failed',
        requestId,
        jobId: resolvedJobId,
        platform,
        extra: {
          error: error.message,
          timeout: isTimeout,
          spansMs: spans.snapshot(),
        },
      });
    }
  }

  const rawLeads = Object.values(resultsByPlatform).flat();
  const durationMs = Date.now() - startTime;

  logEvent({
    message: 'Scrape job completed',
    requestId,
    jobId: resolvedJobId,
    extra: {
      totalLeads,
      durationMs,
      parserHitRatio: computeParserHitRatio(metrics.counters),
    },
  });

  res.json({
    success: true,
    requestId,
    jobId: resolvedJobId,
    adapterVersion: ADAPTER_VERSION,
    raw_leads: rawLeads,
    totalLeads,
    durationMs,
    results: resultsByPlatform,
    platformsUsed: platforms,
    spansMs: Object.fromEntries(
      Object.entries(spansByPlatform).map(([platform, spans]) => [platform, spans.snapshot()])
    ),
    parserHitRatio: computeParserHitRatio(metrics.counters),
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  logEvent({
    message: 'ACQZ scraper service started',
    requestId: 'system',
    jobId: 'system',
    extra: { port },
  });
});
