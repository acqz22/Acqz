import { createLead } from './leadModel.js';
import { extractAndNormalizeEmails, extractUrls, normalizePhones, normalizeUrl } from './cleaners.js';
import { scoreLeadConfidence } from './scoring.js';

const SOCIAL_HOSTS = ['instagram.com', 'facebook.com', 'linkedin.com', 'x.com', 'twitter.com', 'youtube.com', 'tiktok.com'];

const pick = (record, ...keys) => keys.map((key) => record?.[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== '');

const getSocialLinks = (urls = []) => urls.filter((url) => SOCIAL_HOSTS.some((host) => url.includes(host)));

const toAuditRecord = ({ raw, normalized, reasons, accepted, minimumConfidence }) => ({
  raw,
  normalized,
  confidence: normalized.confidence,
  scoreReasons: reasons,
  accepted,
  minimumConfidence
});

export const normalizeLeadRecord = (raw = {}, context = {}) => {
  const sourceUrl = normalizeUrl(pick(raw, 'link', 'url', 'sourceUrl')) || '';
  const urls = [
    ...extractUrls(raw),
    ...extractUrls(raw.description, raw.bio, raw.notes, raw.title, raw.link)
  ];

  const website = normalizeUrl(pick(raw, 'website')) || urls.find((url) => !SOCIAL_HOSTS.some((host) => url.includes(host))) || '';
  const socialLinks = getSocialLinks(urls);

  const lead = createLead({
    name: String(pick(raw, 'name', 'title', 'contactName') || '').trim(),
    businessName: String(pick(raw, 'businessName', 'title', 'company', 'name') || '').trim(),
    phones: normalizePhones([pick(raw, 'phone', 'phoneNumber'), ...(raw.phones || [])], { defaultCountryCode: context.defaultCountryCode }),
    emails: extractAndNormalizeEmails(raw.email, raw.emails, raw.description, raw.bio, raw.notes),
    website,
    socialLinks,
    location: String(pick(raw, 'location', 'address', 'city') || '').trim(),
    category: String(pick(raw, 'category', 'industry', 'type') || '').trim(),
    sourcePlatform: String(pick(raw, 'sourcePlatform', 'source') || context.sourcePlatform || '').trim(),
    sourceUrl
  });

  const { score, reasons } = scoreLeadConfidence(lead, context);
  return { ...lead, confidence: score, _scoreReasons: reasons };
};

export const normalizeLeads = (rawRecords = [], options = {}) => {
  const minimumConfidence = Number.isFinite(options.minimumConfidence) ? options.minimumConfidence : 0;
  const normalizedAudit = rawRecords.map((raw) => {
    const normalized = normalizeLeadRecord(raw, options);
    const accepted = normalized.confidence >= minimumConfidence;
    return toAuditRecord({
      raw,
      normalized: { ...normalized, _scoreReasons: undefined },
      reasons: normalized._scoreReasons,
      accepted,
      minimumConfidence
    });
  });

  const leads = normalizedAudit
    .filter((record) => record.accepted)
    .map((record) => ({ ...record.normalized }));

  return {
    leads,
    audit: normalizedAudit
  };
};
