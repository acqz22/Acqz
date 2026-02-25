function fingerprint(lead) {
  const domain = (lead.website || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
  const phone = (lead.phones?.[0] || '').replace(/\D/g, '');
  const email = (lead.emails?.[0] || '').toLowerCase();
  return [lead.businessName?.toLowerCase() || '', domain, phone, email, (lead.location || '').toLowerCase()].join('|');
}

export function dedupeLeads(leads) {
  const seen = new Map();
  for (const lead of leads) {
    const key = fingerprint(lead);
    if (!seen.has(key)) {
      seen.set(key, { ...lead, sourcePlatforms: [lead.sourcePlatform], sourceUrls: [lead.sourceUrl].filter(Boolean) });
      continue;
    }
    const existing = seen.get(key);
    existing.sourcePlatforms = [...new Set([...existing.sourcePlatforms, lead.sourcePlatform])];
    existing.sourceUrls = [...new Set([...existing.sourceUrls, lead.sourceUrl].filter(Boolean))];
    existing.confidence = Math.max(existing.confidence, lead.confidence);
  }

  return {
    dedupeStats: { before: leads.length, after: seen.size, merged: leads.length - seen.size },
    leads: [...seen.values()],
  };
}
