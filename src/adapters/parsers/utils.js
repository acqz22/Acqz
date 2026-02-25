export const DEFAULT_FIELDS = {
  businessName: '',
  phone: '',
  email: '',
  website: '',
  location: '',
  category: '',
  profileUrl: '',
};

export function extractText($, root, selectors = []) {
  for (const selector of selectors) {
    const value = root.find(selector).first().text().trim();
    if (value) return value;
  }
  return '';
}

export function extractAttr($, root, selectors = [], attr = 'href') {
  for (const selector of selectors) {
    const value = root.find(selector).first().attr(attr)?.trim();
    if (value) return value;
  }
  return '';
}

export function extractFromRegex(text, regex) {
  return text.match(regex)?.[0]?.trim() ?? '';
}

export function extractEmail(text) {
  return text.match(/(?:^|\s)([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?=\s|$)/i)?.[1] ?? '';
}

export function normalizeUrl(value = '') {
  if (!value) return '';
  if (value.startsWith('/')) return `https://www.google.com${value}`;
  return value;
}

export function buildLead(fields, source, parserVersion, fingerprint) {
  return {
    ...DEFAULT_FIELDS,
    ...fields,
    source,
    parserVersion,
    fingerprint,
  };
}

export function parseBySelectorChain({ $, containerSelectors, maxLeads, buildRecord }) {
  const leads = [];
  for (const selector of containerSelectors) {
    $(selector).each((_, el) => {
      if (leads.length >= maxLeads) return false;
      const lead = buildRecord($(el));
      if (lead?.businessName) leads.push(lead);
      return undefined;
    });
    if (leads.length) break;
  }
  return leads;
}
