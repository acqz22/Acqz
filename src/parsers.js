import { load } from 'cheerio';

const PHONE_REGEX = /(\+?\d[\d\s\-\(\)]{8,})/;

function normalizeText(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function pickTextWithFallback($, scope, selectors = []) {
  for (const selector of selectors) {
    const value = normalizeText(scope.find(selector).first().text());
    if (value) return value;
  }
  return '';
}

function pickAttrWithFallback($, scope, selectors = [], attr = 'href') {
  for (const selector of selectors) {
    const value = normalizeText(scope.find(selector).first().attr(attr) || '');
    if (value) return value;
  }
  return '';
}

const googleSelectorSet = {
  container: ['.g', '.Nv2G9d', '.section-result', '[jsname]'],
  title: ['h3', '.fontHeadlineSmall', '.name'],
  link: ['a[href]'],
  address: ['.VwiC3b', '.address']
};

const directorySelectorSet = {
  container: ['.result', '.jdgm-listing', '.info'],
  title: ['.business-name', '.jdgm-listing-name', '.store-name', '.n a'],
  phone: ['.phones', '.jdgm-phone', '.phone', '.phones.phone primary'],
  address: ['.street-address', '.adr', '.address']
};

const socialSelectorSet = {
  container: ['a', 'h1', 'h2', 'span'],
  name: ['&self']
};

function collectContainers($, selectorChain) {
  const nodes = [];
  const seen = new Set();

  for (const selector of selectorChain) {
    $(selector).each((_, el) => {
      if (!seen.has(el)) {
        seen.add(el);
        nodes.push(el);
      }
    });
  }

  return nodes.length ? nodes : null;
}

function parseGoogleAdapter($, maxLeads, platform) {
  const results = [];
  const containers = collectContainers($, googleSelectorSet.container);
  if (!containers) return results;

  for (const el of containers) {
    if (results.length >= maxLeads) break;
    const scope = $(el);
    const title = pickTextWithFallback($, scope, googleSelectorSet.title) || normalizeText(scope.text().split('\n')[0]);
    const link = pickAttrWithFallback($, scope, googleSelectorSet.link);
    const phone = normalizeText(scope.text().match(PHONE_REGEX)?.[0] || '');
    const address = pickTextWithFallback($, scope, googleSelectorSet.address);

    if (title && title.length > 3) {
      results.push({ title, link, phone, address, source: platform });
    }
  }

  return results;
}

function parseDirectoryAdapter($, maxLeads, platform) {
  const results = [];
  const containers = collectContainers($, directorySelectorSet.container);
  if (!containers) return results;

  for (const el of containers) {
    if (results.length >= maxLeads) break;
    const scope = $(el);
    const title = pickTextWithFallback($, scope, directorySelectorSet.title);
    const phone = pickTextWithFallback($, scope, directorySelectorSet.phone);
    const address = pickTextWithFallback($, scope, directorySelectorSet.address);

    if (title) {
      results.push({ title, phone, address, source: platform });
    }
  }

  return results;
}

function parseSocialAdapter($, maxLeads, platform) {
  const results = [];
  const containers = collectContainers($, socialSelectorSet.container);
  if (!containers) return results;

  for (const el of containers) {
    if (results.length >= maxLeads) break;
    const scope = $(el);
    const text = normalizeText(scope.text());
    if (text.length > 5 && (text.includes('@') || /\d{10}/.test(text) || text.length < 50)) {
      results.push({ name: text, source: platform });
    }
  }

  return results;
}

export const PARSER_ADAPTERS = {
  google: {
    selectorSetVersion: 'google-v2026.01',
    parse: parseGoogleAdapter
  },
  directory: {
    selectorSetVersion: 'directory-v2026.01',
    parse: parseDirectoryAdapter
  },
  social: {
    selectorSetVersion: 'social-v2026.01',
    parse: parseSocialAdapter
  }
};

function resolveAdapter(platform) {
  if (platform.includes('google')) return { key: 'google', ...PARSER_ADAPTERS.google };
  if (platform === 'yellowpages' || platform === 'justdial') return { key: 'directory', ...PARSER_ADAPTERS.directory };
  return { key: 'social', ...PARSER_ADAPTERS.social };
}

export function parsePlatformHtml(platform, html, { maxLeads = 40 } = {}) {
  const $ = load(html);
  const adapter = resolveAdapter(platform);
  const leads = adapter.parse($, maxLeads, platform).map((lead) => ({
    ...lead,
    selectorSetVersion: adapter.selectorSetVersion
  }));

  return {
    adapter: adapter.key,
    selectorSetVersion: adapter.selectorSetVersion,
    leads
  };
}
