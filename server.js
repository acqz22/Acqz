import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;

app.get('/', (req, res) => res.send('<h1>🚀 ACQZ Lead Scraper – Fixed & Working</h1>'));

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  let { platforms, maxLeadsPerPlatform = 30, search, location, input = {} } = req.body;

  if (!platforms || !location || !ZENROWS_KEY) {
    return res.status(400).json({ success: false, error: 'Missing platforms / location / ZENROWS_API_KEY' });
  }
  if (typeof platforms === 'string') platforms = [platforms];

  const resultsByPlatform = {};
  let totalLeads = 0;
  const maxThis = Math.min(parseInt(maxLeadsPerPlatform), 80);

  console.log(`[START] Platforms: ${platforms} | Search: ${search} | Location: ${location}`);

  for (const platform of platforms) {
    let results = [];
    try {
      let targetUrl = '';
      let zenParams = '&js_render=true&premium_proxy=true&antibot=true';

      const query = search || input.niche || input.search || 'restaurant';
      const loc = location || input.location || 'Bangalore, India';

      switch (platform) {
        case 'google_maps':
          targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(query + ' ' + loc)}`;
          zenParams = '&js_render=true';
          break;
        case 'instagram':
          targetUrl = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`;
          break;
        case 'linkedin':
          targetUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(query)}`;
          break;
        case 'facebook':
          targetUrl = `https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`;
          break;
        case 'meta_ads':
          targetUrl = `https://www.facebook.com/ads/library/?q=${encodeURIComponent(query)}`;
          break;
        case 'google_ads':
        case 'google_search':
          targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' ' + loc)}`;
          break;
        case 'youtube':
          targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
          break;
        case 'twitter':
          targetUrl = `https://twitter.com/explore?q=${encodeURIComponent(query)}`;
          break;
        case 'yellowpages':
          targetUrl = `https://www.yellowpages.com/search?search_terms=\( {encodeURIComponent(query)}&geo_location_terms= \){encodeURIComponent(loc)}`;
          break;
        case 'justdial':
          targetUrl = `https://www.justdial.com/\( {encodeURIComponent(loc)}/ \){encodeURIComponent(query)}`;
          break;
        case 'tiktok':
          targetUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
          break;
        default:
          targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' ' + loc)}`;
      }

      console.log(`[FETCH] ${platform} → ${targetUrl}`);

      const zenUrl = `https://api.zenrows.com/v1/?apikey=\( {ZENROWS_KEY}&url= \){encodeURIComponent(targetUrl)}${zenParams}`;
      const { data: html } = await axios.get(zenUrl, { timeout: 40000 });
      const $ = load(html);

      // Stronger parsing (2026-ready)
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
            source: platform
          });
        });
      } else {
        // Social platforms fallback
        $('a, h1, h2, span').each((i, el) => {
          if (results.length >= maxThis) return false;
          const text = $(el).text().trim();
          if (text.length > 5 && (text.includes('@') || text.match(/\d{10}/) || text.length < 50)) {
            results.push({ name: text, source: platform });
          }
        });
      }

      console.log(`[RESULT] ${platform} → Found ${results.length} leads`);

      resultsByPlatform[platform] = results.length ? results : [{ note: `${platform} - no public leads visible on first page` }];
      totalLeads += results.length;

    } catch (e) {
      console.error(`[ERROR] ${platform}:`, e.message);
      resultsByPlatform[platform] = [{ error: e.message }];
    }
  }

  res.json({
    success: true,
    totalLeads,
    durationMs: Date.now() - startTime,
    results: resultsByPlatform,
    platformsUsed: platforms
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`✅ ACQZ Scraper v3 LIVE – Fixed`));
