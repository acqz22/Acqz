import axios from 'axios';
import { load } from 'cheerio';

export function buildTargetUrl({ platform, keyword, location }) {
  const query = keyword || 'restaurant';
  const loc = location || 'Bangalore, India';

  switch (platform) {
    case 'google_maps':
      return {
        targetUrl: `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${loc}`)}`,
        zenParams: '&js_render=true',
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
        targetUrl: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(loc)}`,
      };
    case 'justdial':
      return {
        targetUrl: `https://www.justdial.com/${encodeURIComponent(loc)}/${encodeURIComponent(query)}`,
      };
    case 'tiktok':
      return { targetUrl: `https://www.tiktok.com/search?q=${encodeURIComponent(query)}` };
    default:
      return { targetUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} ${loc}`)}` };
  }
}

export async function scrapePlatformKeyword({
  platform,
  keyword,
  location,
  maxLeads,
  zenrowsApiKey,
  signal,
  requestTimeoutMs,
}) {
  const { targetUrl, zenParams = '&js_render=true&premium_proxy=true&antibot=true' } = buildTargetUrl({
    platform,
    keyword,
    location,
  });

  const zenUrl = `https://api.zenrows.com/v1/?apikey=${zenrowsApiKey}&url=${encodeURIComponent(targetUrl)}${zenParams}`;
  const { data: html } = await axios.get(zenUrl, {
    timeout: requestTimeoutMs,
    signal,
  });

  return parseLeads({ platform, html, maxLeads });
}

export function parseLeads({ platform, html, maxLeads }) {
  const $ = load(html);
  const results = [];

  if (platform.includes('google')) {
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

  if (platform === 'yellowpages' || platform === 'justdial') {
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

  $('a, h1, h2, span').each((_, el) => {
    if (results.length >= maxLeads) return false;
    const text = $(el).text().trim();
    if (text.length > 5 && (text.includes('@') || /\d{10}/.test(text) || text.length < 50)) {
      results.push({ name: text, source: platform });
    }
  });

  return results;
}
