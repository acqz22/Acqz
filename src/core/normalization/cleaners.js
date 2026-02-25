const PHONE_CLEAN_PATTERN = /[^\d+]/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /(https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+)/gi;

const uniq = (items) => [...new Set(items.filter(Boolean))];

export const normalizePhone = (value, defaultCountryCode = '+1') => {
  if (!value) return null;

  const cleaned = String(value).trim().replace(PHONE_CLEAN_PATTERN, '');
  if (!cleaned) return null;

  const hasPlus = cleaned.startsWith('+');
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) return null;

  if (hasPlus) return `+${digitsOnly}`;
  if (digitsOnly.length === 10) return `${defaultCountryCode}${digitsOnly}`;
  return `+${digitsOnly}`;
};

export const normalizePhones = (values = [], options = {}) => {
  const { defaultCountryCode } = options;
  return uniq(values.map((value) => normalizePhone(value, defaultCountryCode)).filter(Boolean));
};

export const extractAndNormalizeEmails = (...values) => {
  const combined = values.flat().filter(Boolean).join(' ');
  const extracted = combined.match(EMAIL_PATTERN) || [];
  return uniq(extracted.map((email) => email.toLowerCase()));
};

export const normalizeUrl = (value) => {
  if (!value) return null;

  try {
    const candidate = String(value).trim();
    const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    const parsed = new URL(withProtocol);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const extractUrls = (...values) => {
  const combined = values.flat().filter(Boolean).join(' ');
  return uniq((combined.match(URL_PATTERN) || []).map((url) => normalizeUrl(url)).filter(Boolean));
};
