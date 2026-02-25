import axios from 'axios';
import { load } from 'cheerio';

export const DEFAULT_MAX_LEADS = 80;

export function resolveQuery(input) {
  return input.search || input.niche || 'restaurant';
}

export function resolveLocation(input) {
  return input.location || 'Bangalore, India';
}

export async function fetchHtmlWithZenrows({ targetUrl, zenrowsKey, zenParams = '&js_render=true&premium_proxy=true&antibot=true', timeout = 40000 }) {
  if (!zenrowsKey) {
    throw new Error('ZENROWS_API_KEY is required');
  }

  const zenUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsKey}&url=${encodeURIComponent(targetUrl)}${zenParams}`;
  const { data } = await axios.get(zenUrl, { timeout });
  return data;
}

export function parseGoogleLikeLeads(html, platform, maxLeads) {
  const $ = load(html);
  const results = [];

  $('.g, .Nv2G9d, .fontHeadlineSmall, .section-result, [jsname]').each((_, el) => {
    if (results.length >= maxLeads) return false;
    const title = $(el).find('h3, .fontHeadlineSmall, .name').text().trim() || $(el).text().split('\n')[0];
    const link = $(el).find('a').attr('href') || '';
    const phone = $(el).text().match(/(\+?\d[\d\s\-\(\)]{8,})/)?.[0] || '';
    const address = $(el).find('.VwiC3b, .address').text().trim();

    if (title && title.length > 3) {
      results.push({ title, link, phone, address, source: platform });
    }
  });

  return results;
}

export function parseDirectoryLeads(html, platform, maxLeads) {
  const $ = load(html);
  const results = [];

  $('.result, .jdgm-listing').each((_, el) => {
    if (results.length >= maxLeads) return false;

    results.push({
      title: $(el).find('.business-name, .jdgm-listing-name, .store-name').text().trim(),
      phone: $(el).find('.phones, .jdgm-phone, .phone').text().trim(),
      address: $(el).find('.street-address, .adr').text().trim(),
      source: platform,
    });
  });

  return results;
}

export function parseSocialLeads(html, platform, maxLeads) {
  const $ = load(html);
  const results = [];

  $('a, h1, h2, span').each((_, el) => {
    if (results.length >= maxLeads) return false;
    const text = $(el).text().trim();

    if (text.length > 5 && (text.includes('@') || /\d{10}/.test(text) || text.length < 50)) {
      results.push({ name: text, source: platform });
    }
  });

  return results;
}

export function toMaxLeads(requestedMax) {
  const parsed = Number.parseInt(requestedMax ?? DEFAULT_MAX_LEADS, 10);
  return Number.isFinite(parsed) ? Math.min(parsed, DEFAULT_MAX_LEADS) : DEFAULT_MAX_LEADS;
}

export function normalizeAdapterError(platform, error) {
  return { source: platform, error: error.message };
}
