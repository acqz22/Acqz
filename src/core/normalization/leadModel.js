const DEFAULT_LEAD = Object.freeze({
  name: '',
  businessName: '',
  phones: [],
  emails: [],
  website: '',
  socialLinks: [],
  location: '',
  category: '',
  sourcePlatform: '',
  sourceUrl: '',
  confidence: 0
});

const dedupeStrings = (values = []) => [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];

export const createLead = (partial = {}) => ({
  ...DEFAULT_LEAD,
  ...partial,
  phones: dedupeStrings(partial.phones || []),
  emails: dedupeStrings(partial.emails || []),
  socialLinks: dedupeStrings(partial.socialLinks || []),
  confidence: Number.isFinite(partial.confidence) ? partial.confidence : DEFAULT_LEAD.confidence
});

export const LEAD_FIELDS = Object.freeze(Object.keys(DEFAULT_LEAD));
