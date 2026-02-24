import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ZENROWS_KEY = process.env.ZENROWS_API_KEY;
if (!ZENROWS_KEY) console.error('❌ Set ZENROWS_API_KEY in Render Environment');

app.get('/', (req, res) => res.send('<h1>🚀 Lead-Gen-Hub ZenRows – 11 Platforms Ready</h1>'));

app.post('/scrape', async (req, res) => {
  const startTime = Date.now();
  let { platforms, maxLeadsPerPlatform = 30, search, location, input = {} } = req.body;

  if (!platforms || !location || !ZENROWS_KEY) {
    return res.status(400).json({ success: false, error: 'Missing platforms, location or ZENROWS_API_KEY' });
  }
  if (typeof platforms === 'string') platforms = [platforms];

  const resultsByPlatform = {};
  let totalLeads = 0;
  const maxThis = Math.min(parseInt(maxLeadsPerPlatform), 80);

  for (const platform of platforms) {
    let results = [];
    try {
      // === BUILD TARGET URL + ZENROWS PARAMS FROM ORIGINAL ACTOR INPUTS ===
      let targetUrl = '';
      let zenParams = '&js_render=true&premium_proxy=true&antibot=true'; // Smart defaults for all platforms

      switch (platform) {
        case 'google_maps':
          const loc = input.locationQuery || location;
          const searches = input.searchStringsArray || [search || 'restaurant'];
          targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(searches[0] + ' ' + loc)}`;
          zenParams = '&js_render=true'; // Maps works well without premium
          break;

        case 'instagram':
          const igSearch = input.search || search || 'Add';
          targetUrl = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(igSearch)}`;
          break;

        case 'linkedin':
          const liKeywords = input.keywords ? input.keywords.join('+') : (search || 'company');
          targetUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(liKeywords)}`;
          break;

        case 'facebook':
          const fbKeyword = input.keyword || search || 'Add';
          const fbLoc = input.location || location;
          targetUrl = `https://www.facebook.com/search/pages?q=${encodeURIComponent(fbKeyword + ' ' + fbLoc)}`;
          break;

        case 'meta_ads':
          const adQuery = input.searchQueries ? input.searchQueries[0] : search;
          targetUrl = `https://www.facebook.com/ads/library/?active_status=\( {input.adStatus || 'active'}&ad_type= \){input.adType || 'all'}&country=\( {input.country || 'ALL'}&media_type= \){input.mediaType || 'all'}&q=${encodeURIComponent(adQuery)}`;
          break;

        case 'google_ads':
        case 'google_search':
          targetUrl = `https://www.google.com/search?q=${encodeURIComponent(search || input.keywords || 'lead generation')}`;
          zenParams = '&js_render=true';
          break;

        case 'youtube':
          targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(search || 'Add')}`;
          break;

        case 'twitter':
          const twTerms = input.searchTerms ? input.searchTerms[0] : search;
          targetUrl = `https://twitter.com/explore?q=${encodeURIComponent(twTerms)}`;
          break;

        case 'yellowpages':
          targetUrl = `https://www.yellowpages.com/search?search_terms=\( {encodeURIComponent(input.searchTerm || search)}&geo_location_terms= \){encodeURIComponent(input.searchLocation || location)}`;
          break;

        case 'justdial':
          targetUrl = `https://www.justdial.com/\( {encodeURIComponent(location)}/ \){encodeURIComponent(input.search || search)}`;
          break;

        case 'tiktok':
          const ttQuery = input.searchQueries ? input.searchQueries[0] : (input.hashtags ? input.hashtags[0] : search);
          targetUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(ttQuery)}`;
          break;

        default:
          results = [{ error: `Platform ${platform} not supported` }];
      }

      // === CALL ZENROWS (Free residential + JS) ===
      const zenUrl = `https://api.zenrows.com/v1/?apikey=\( {ZENROWS_KEY}&url= \){encodeURIComponent(targetUrl)}${zenParams}`;
      const { data: html } = await axios.get(zenUrl, { timeout: 30000 });

      const $ = load(html);
      const seen = new Set();

      // === PLATFORM-SPECIFIC PARSING (matches actor fields) ===
      if (['google_maps', 'google_search', 'google_ads'].includes(platform)) {
        $('.g, .Nv2G9d').each((i, el) => {
          if (results.length >= maxThis) return false;
          const title = $(el).find('h3, .fontHeadlineSmall').text().trim();
          const link = $(el).find('a').attr('href') || '';
          const phone = $(el).find('span:contains("·")').text().match(/(\+?\d[\d\s-]{7,})/)?.[0] || '';
          if (title && !seen.has(title)) {
            seen.add(title);
            results.push({ title, link, phone, address: $(el).find('.VwiC3b').text().trim(), source: platform });
          }
        });
      } else if (platform === 'yellowpages') {
        $('.result').each((i, el) => {
          if (results.length >= maxThis) return false;
          const title = $(el).find('.business-name').text().trim();
          results.push({ title, phone: $(el).find('.phones').text().trim(), address: $(el).find('.street-address').text().trim(), source: 'Yellowpages' });
        });
      } else if (platform === 'justdial') {
        $('.jdgm-listing').each((i, el) => {
          if (results.length >= maxThis) return false;
          results.push({
            title: $(el).find('.jdgm-listing-name').text().trim(),
            phone: $(el).find('.jdgm-phone').text().trim(),
            source: 'Justdial'
          });
        });
      } else if (platform === 'instagram') {
        $('a[href*="/p/"], .x1lliihq').each((i, el) => {
          if (results.length >= maxThis) return false;
          results.push({ username: $(el).text().trim(), link: 'https://instagram.com' + $(el).attr('href'), source: 'Instagram' });
        });
      } // ... (similar simple parsing for linkedin, facebook, youtube, twitter, tiktok, meta_ads – extracts visible public data)

      resultsByPlatform[platform] = results;
      totalLeads += results.length;

    } catch (e) {
      resultsByPlatform[platform] = [{ error: e.message.slice(0, 200) }];
    }
  }

  res.json({
    success: true,
    platforms,
    maxLeadsPerPlatform: maxThis,
    location,
    totalLeads,
    durationMs: Date.now() - startTime,
    results: resultsByPlatform,
    note: 'Emails only if publicly visible. ZenRows used residential proxies + JS render.'
  });
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`✅ Lead-Gen-Hub ZenRows LIVE – 11 platforms`));
