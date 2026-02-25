import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';
import {
  leadRequestSchema,
  MAX_LEAD_COUNT_PER_PLATFORM
} from './src/contracts/leadRequest.js';
import { leadResponseSchema } from './src/contracts/leadResponse.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

const platformTargetUrlFactory = (platform, query, location) => {
  switch (platform) {
    case 'google_maps':
      return {
        targetUrl: `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${location}`)}`,
        zenParams: '&js_render=true'
      };
    case 'instagram':
      return { targetUrl: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    case 'linkedin':
      return { targetUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    case 'facebook':
      return { targetUrl: `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    case 'meta_ads':
      return { targetUrl: `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    case 'google_ads':
    case 'google_search':
      return { targetUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    case 'youtube':
      return { targetUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    case 'twitter':
      return { targetUrl: `https://twitter.com/explore?q=${encodeURIComponent(query)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    case 'yellowpages':
      return {
        targetUrl: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true'
      };
    case 'justdial':
      return {
        targetUrl: `https://www.justdial.com/${encodeURIComponent(location)}/${encodeURIComponent(query)}`,
        zenParams: '&js_render=true&premium_proxy=true&antibot=true'
      };
    case 'tiktok':
      return { targetUrl: `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
    default:
      return { targetUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${location}`)}`, zenParams: '&js_render=true&premium_proxy=true&antibot=true' };
  }
};

const getStructuredValidationError = (issues) => ({
  code: 'INVALID_REQUEST',
  message: 'Payload validation failed',
  details: issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code
  }))
});

app.get('/', (req, res) => res.send('<h1>🚀 ACQZ Lead Scraper – Schema-Validated API</h1>'));

app.post('/scrape', async (req, res) => {
  const startEpoch = Date.now();
  const startedAt = new Date(startEpoch).toISOString();

  if (!ZENROWS_KEY) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'ZENROWS_API_KEY is not configured'
      }
    });
  }

  const parsed = leadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: getStructuredValidationError(parsed.error.issues)
    });
  }

  const payload = parsed.data;
  const perPlatformLimit = Math.min(
    Math.ceil(payload.leadCount / payload.platforms.length),
    MAX_LEAD_COUNT_PER_PLATFORM
  );

  const leads = [];
  const byPlatform = [];
  const errors = [];
  const perPlatformMs = {};

  for (const platform of payload.platforms) {
    const platformStart = Date.now();
    const query = payload.keywords[0] || 'restaurant';
    const { targetUrl, zenParams } = platformTargetUrlFactory(platform, query, payload.location);

    try {
      const zenUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(targetUrl)}${zenParams}`;
      const { data: html } = await axios.get(zenUrl, { timeout: payload.timeoutMs });
      const $ = load(html);

      const platformLeads = [];

      if (platform.includes('google')) {
        $('.g, .Nv2G9d, .fontHeadlineSmall, .section-result, [jsname]').each((i, el) => {
          if (platformLeads.length >= perPlatformLimit) return false;
          const title = $(el).find('h3, .fontHeadlineSmall, .name').text().trim() || $(el).text().split('\n')[0];
          const profileUrl = $(el).find('a').attr('href') || '';
          const phone = $(el).text().match(/(\+?\d[\d\s\-\(\)]{8,})/)?.[0] || '';
          const address = $(el).find('.VwiC3b, .address').text().trim();
          if (title && title.length > 3) {
            platformLeads.push({ platform, title, profileUrl, phone, address });
          }
        });
      } else if (platform === 'yellowpages' || platform === 'justdial') {
        $('.result, .jdgm-listing').each((i, el) => {
          if (platformLeads.length >= perPlatformLimit) return false;
          const title = $(el).find('.business-name, .jdgm-listing-name, .store-name').text().trim();
          if (!title) return;
          platformLeads.push({
            platform,
            title,
            phone: $(el).find('.phones, .jdgm-phone, .phone').text().trim(),
            address: $(el).find('.street-address, .adr').text().trim()
          });
        });
      } else {
        $('a, h1, h2, span').each((i, el) => {
          if (platformLeads.length >= perPlatformLimit) return false;
          const text = $(el).text().trim();
          if (text.length > 5 && (text.includes('@') || text.match(/\d{10}/) || text.length < 50)) {
            platformLeads.push({ platform, name: text });
          }
        });
      }

      byPlatform.push({
        platform,
        found: platformLeads.length,
        returned: platformLeads.length,
        limitedBy: platformLeads.length >= perPlatformLimit ? 'per_platform' : 'none'
      });
      leads.push(...platformLeads);
    } catch (error) {
      errors.push({
        code: 'PLATFORM_FETCH_ERROR',
        message: error.message,
        platform,
        retryable: true
      });
      byPlatform.push({
        platform,
        found: 0,
        returned: 0,
        limitedBy: 'none'
      });
    } finally {
      perPlatformMs[platform] = Date.now() - platformStart;
    }
  }

  const totalFound = byPlatform.reduce((sum, item) => sum + item.found, 0);
  const dedupedLeads = payload.dedupe.enabled
    ? Array.from(new Map(leads.map((lead) => [`${lead.title ?? lead.name ?? ''}-${lead.phone ?? ''}`, lead])).values())
    : leads;
  const returnedLeads = dedupedLeads.slice(0, payload.leadCount);
  const totalReturned = returnedLeads.length;

  const status = errors.length === payload.platforms.length
    ? 'failed'
    : errors.length > 0
      ? 'partial_success'
      : 'success';

  const responsePayload = {
    requestId: payload.requestId,
    status,
    totalFound,
    totalReturned,
    leads: returnedLeads,
    byPlatform,
    errors,
    timings: {
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startEpoch,
      perPlatformMs
    }
  };

  const parsedResponse = leadResponseSchema.safeParse(responsePayload);
  if (!parsedResponse.success) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'RESPONSE_SCHEMA_ERROR',
        message: 'Generated response did not satisfy contract',
        details: parsedResponse.error.issues
      }
    });
  }

  return res.json(parsedResponse.data);
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`✅ ACQZ Scraper LIVE on ${port}`));
