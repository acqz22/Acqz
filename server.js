import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';
import { loadRuntimeConfig } from './config.js';
import { createAuthMiddleware } from './auth.js';
import { createRateLimiter } from './rateLimit.js';
import { createRetentionStore } from './retention.js';

const PLATFORM_URL_BUILDERS = {
  google_maps: ({ query, loc }) => `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${loc}`)}`,
  instagram: ({ query }) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`,
  linkedin: ({ query }) => `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}`,
  facebook: ({ query }) => `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`,
  meta_ads: ({ query }) => `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}`,
  google_ads: ({ query, loc }) => `https://www.google.com/search?q=${encodeURIComponent(`${query} ${loc}`)}`,
  google_search: ({ query, loc }) => `https://www.google.com/search?q=${encodeURIComponent(`${query} ${loc}`)}`,
  youtube: ({ query }) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  twitter: ({ query }) => `https://twitter.com/explore?q=${encodeURIComponent(query)}`,
  yellowpages: ({ query, loc }) => `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(loc)}`,
  justdial: ({ query, loc }) => `https://www.justdial.com/${encodeURIComponent(loc)}/${encodeURIComponent(query)}`,
  tiktok: ({ query }) => `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`,
};

function buildZenUrl({ zenrowsApiKey, targetUrl, platform, complianceMode }) {
  const params = new URLSearchParams({ apikey: zenrowsApiKey, url: targetUrl });

  if (!complianceMode.respectRobots && platform !== 'google_maps') {
    params.set('js_render', 'true');
  }

  if (!complianceMode.respectTos && !complianceMode.strictMode) {
    params.set('premium_proxy', 'true');
    params.set('antibot', 'true');
  }

  return `https://api.zenrows.com/v1/?${params.toString()}`;
}

function enforceCompliance(platforms, complianceMode, config) {
  const effectiveAllowlist = complianceMode.platformAllowlist?.length
    ? complianceMode.platformAllowlist
    : config.allowedPlatforms;

  if (effectiveAllowlist?.length) {
    const denied = platforms.filter((platform) => !effectiveAllowlist.includes(platform));
    if (denied.length) {
      return `Platforms not allowed by policy: ${denied.join(', ')}`;
    }
  }

  if ((config.enforceRobotsAwareMode || config.enforceTosAwareMode) && !complianceMode.strictMode) {
    return 'Server requires strict compliance mode';
  }

  return null;
}

async function start() {
  const config = await loadRuntimeConfig();
  const app = express();
  const retentionStore = createRetentionStore({
    defaultRetentionDays: config.defaultRetentionDays,
    cleanupMs: config.retentionCleanupMs,
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/', (req, res) => res.send('<h1>ACQZ Lead Scraper service is running</h1>'));

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      secretProvider: config.secretProvider,
      activeSigningKeyId: config.activeSigningKeyId,
      retainedRecords: retentionStore.count(),
    });
  });

  app.post('/scrape', createAuthMiddleware(config), createRateLimiter(config), async (req, res) => {
    const startTime = Date.now();
    let { platforms, maxLeadsPerPlatform = 40, search, location, input = {}, retentionDays } = req.body;

    if (!platforms || !location || !config.zenrowsApiKey) {
      return res.status(400).json({ success: false, error: 'Missing platforms / location / configured secret(s)' });
    }

    if (typeof platforms === 'string') platforms = [platforms];

    const complianceMode = {
      respectRobots: req.body?.compliance?.respectRobots !== false,
      respectTos: req.body?.compliance?.respectTos !== false,
      strictMode: req.body?.compliance?.strictMode === true,
      platformAllowlist: req.body?.compliance?.platformAllowlist || null,
    };

    const complianceError = enforceCompliance(platforms, complianceMode, config);
    if (complianceError) {
      return res.status(403).json({ success: false, error: complianceError });
    }

    const resultsByPlatform = {};
    let totalLeads = 0;
    const maxThis = Math.min(parseInt(maxLeadsPerPlatform, 10), 80);

    const query = search || input.niche || input.search || 'restaurant';
    const loc = location || input.location;

    for (const platform of platforms) {
      const buildUrl = PLATFORM_URL_BUILDERS[platform] || PLATFORM_URL_BUILDERS.google_search;
      const targetUrl = buildUrl({ query, loc });

      try {
        const zenUrl = buildZenUrl({
          zenrowsApiKey: config.zenrowsApiKey,
          targetUrl,
          platform,
          complianceMode,
        });

        const { data: html } = await axios.get(zenUrl, { timeout: 40_000 });
        const $ = load(html);
        const results = [];

        if (platform.includes('google')) {
          $('.g, .Nv2G9d, .fontHeadlineSmall, .section-result, [jsname]').each((i, el) => {
            if (results.length >= maxThis) return false;
            const title = $(el).find('h3, .fontHeadlineSmall, .name').text().trim() || $(el).text().split('\n')[0];
            const link = $(el).find('a').attr('href') || '';
            const phone = $(el).text().match(/(\+?\d[\d\s\-\(\)]{8,})/)?.[0] || '';
            const address = $(el).find('.VwiC3b, .address').text().trim();
            if (title && title.length > 3) results.push({ title, link, phone, address, source: platform });
          });
        } else if (platform === 'yellowpages' || platform === 'justdial') {
          $('.result, .jdgm-listing').each((i, el) => {
            if (results.length >= maxThis) return false;
            results.push({
              title: $(el).find('.business-name, .jdgm-listing-name, .store-name').text().trim(),
              phone: $(el).find('.phones, .jdgm-phone, .phone').text().trim(),
              address: $(el).find('.street-address, .adr').text().trim(),
              source: platform,
            });
          });
        } else {
          $('a, h1, h2, span').each((i, el) => {
            if (results.length >= maxThis) return false;
            const text = $(el).text().trim();
            if (text.length > 5 && (text.includes('@') || text.match(/\d{10}/) || text.length < 50)) {
              results.push({ name: text, source: platform });
            }
          });
        }

        resultsByPlatform[platform] = results.length ? results : [{ note: `${platform} - no public leads visible` }];
        totalLeads += results.length;
      } catch (error) {
        resultsByPlatform[platform] = [{ error: error.message }];
      }
    }

    const responsePayload = {
      success: true,
      raw_leads: Object.values(resultsByPlatform).flat(),
      totalLeads,
      durationMs: Date.now() - startTime,
      results: resultsByPlatform,
      platformsUsed: platforms,
      compliance: complianceMode,
      retentionDays: retentionDays || config.defaultRetentionDays,
    };

    retentionStore.add(
      {
        apiKeyId: req.auth.apiKeyId,
        platforms,
        totalLeads,
      },
      retentionDays,
    );

    res.json(responsePayload);
  });

  app.post('/admin/retention/cleanup', createAuthMiddleware(config), (req, res) => {
    retentionStore.cleanup();
    res.json({ success: true, retainedRecords: retentionStore.count() });
  });

  app.listen(config.port, () => {
    console.log(`ACQZ Scraper service listening on ${config.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start service:', error);
  process.exit(1);
});
