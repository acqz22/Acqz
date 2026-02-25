import crypto from 'crypto';

const SUPPORTED_PLATFORMS = [
  'instagram',
  'facebook',
  'linkedin',
  'google_maps',
  'google_ads_transparency',
  'meta_ads_library',
  'x',
  'tiktok',
  'yellowpages',
  'justdial',
];

export function validateLeadRequest(payload = {}) {
  const errors = [];
  const normalized = {
    requestId: payload.requestId || crypto.randomUUID(),
    leadCount: Number(payload.leadCount ?? payload.numberOfLeads ?? 50),
    keywords: Array.isArray(payload.keywords)
      ? payload.keywords.filter(Boolean)
      : [payload.niche || payload.keyword || ''],
    location: payload.location || '',
    platforms: Array.isArray(payload.platforms) && payload.platforms.length
      ? payload.platforms
      : SUPPORTED_PLATFORMS,
    filters: payload.filters || {},
    extractDetails: payload.extractDetails !== false,
    extractSocialLinks: payload.extractSocialLinks !== false,
    callbackUrl: payload.callbackUrl,
    timeoutMs: Number(payload.timeoutMs ?? 90000),
    dedupe: payload.dedupe !== false,
    minimumConfidence: Number(payload.minimumConfidence ?? 35),
  };

  if (!normalized.location) errors.push('location is required');
  if (!normalized.keywords.length || !normalized.keywords[0]) errors.push('keywords are required');
  if (!Number.isFinite(normalized.leadCount) || normalized.leadCount < 1 || normalized.leadCount > 1000) {
    errors.push('leadCount must be between 1 and 1000');
  }

  const invalidPlatforms = normalized.platforms.filter((platform) => !SUPPORTED_PLATFORMS.includes(platform));
  if (invalidPlatforms.length) errors.push(`unsupported platforms: ${invalidPlatforms.join(', ')}`);

  return { valid: errors.length === 0, errors, normalized };
}

export { SUPPORTED_PLATFORMS };
