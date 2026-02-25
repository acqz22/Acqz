import axios from 'axios';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';

export class BaseAdapter {
  constructor({ platform, zenrowsApiKey, zenParams = '&js_render=true' }) {
    this.platform = platform;
    this.zenrowsApiKey = zenrowsApiKey;
    this.zenParams = zenParams;
  }

  async fetch(targetUrl) {
    const zenUrl = `https://api.zenrows.com/v1/?apikey=${this.zenrowsApiKey}&url=${encodeURIComponent(targetUrl)}${this.zenParams}`;
    const { data: html } = await axios.get(zenUrl, { timeout: 40000 });
    return {
      html,
      $: load(html),
      fingerprint: this.createFingerprint(html, targetUrl),
    };
  }

  createFingerprint(html, targetUrl) {
    const hash = createHash('sha256').update(html).digest('hex').slice(0, 16);
    return { hash, htmlLength: html.length, targetUrl };
  }

  parse() {
    throw new Error(`parse() not implemented for ${this.platform}`);
  }
}
