import axios from 'axios';
import { load } from 'cheerio';
import { buildRequestFingerprint } from '../fingerprint/fingerprintSuite.js';

export class BaseAdapter {
  constructor({ name, buildUrl }) {
    this.name = name;
    this.buildUrl = buildUrl;
  }

  async searchLeads({ keyword, location, limit, zenrowsApiKey }) {
    const targetUrl = this.buildUrl(keyword, location);
    const fingerprint = buildRequestFingerprint(targetUrl.length + keyword.length);
    const html = await this.fetchHtml(targetUrl, zenrowsApiKey, fingerprint.headers);
    return this.parse(html, { keyword, location, limit, targetUrl });
  }

  async fetchHtml(targetUrl, zenrowsApiKey, headers) {
    const url = zenrowsApiKey
      ? `https://api.zenrows.com/v1/?apikey=${encodeURIComponent(zenrowsApiKey)}&url=${encodeURIComponent(targetUrl)}&js_render=true`
      : targetUrl;
    const response = await axios.get(url, { headers, timeout: 45000 });
    return response.data;
  }

  parse(html, { limit, targetUrl }) {
    const $ = load(html);
    const leads = [];
    $('a').each((index, element) => {
      if (leads.length >= limit) return false;
      const title = $(element).text().trim();
      const link = $(element).attr('href') || '';
      if (title.length > 3) leads.push({ title, link, sourceUrl: targetUrl, text: title });
      return undefined;
    });
    return leads;
  }
}
