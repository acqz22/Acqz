const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/g;

export function normalizeLead(rawLead, context) {
  const textBlob = [rawLead.title, rawLead.name, rawLead.description, rawLead.snippet, rawLead.text]
    .filter(Boolean)
    .join(' ');

  const emails = [...new Set((textBlob.match(emailRegex) || []).map((email) => email.toLowerCase()))];
  const phones = [...new Set((textBlob.match(phoneRegex) || []).map((phone) => phone.replace(/\s+/g, ' ').trim()))];

  const socialLinks = (rawLead.socialLinks || []).filter(Boolean);
  const confidence = scoreLead({ ...rawLead, emails, phones, socialLinks }, context);

  return {
    name: rawLead.name || rawLead.title || '',
    businessName: rawLead.businessName || rawLead.title || rawLead.name || '',
    emails,
    phones,
    website: rawLead.website || rawLead.link || '',
    socialLinks,
    location: rawLead.location || context.location,
    category: rawLead.category || context.keyword,
    sourcePlatform: context.platform,
    sourceUrl: rawLead.link || '',
    confidence,
    raw: rawLead,
  };
}

export function scoreLead(lead, context) {
  let score = 0;
  if (lead.businessName) score += 25;
  if (lead.phones?.length) score += 35;
  if (lead.emails?.length) score += 30;
  if (lead.website) score += 10;
  if ((lead.location || '').toLowerCase().includes(context.location.toLowerCase())) score += 10;
  return Math.min(score, 100);
}
