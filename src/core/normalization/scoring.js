const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export const scoreLeadConfidence = (lead, context = {}) => {
  let score = 0;
  const reasons = [];

  if (lead.phones.length > 0 && lead.businessName) {
    score += 40;
    reasons.push('phone_and_business_name');
  }

  if (lead.website) {
    score += 20;
    reasons.push('has_website');
  }

  if (context.requestedLocation && lead.location) {
    const expected = context.requestedLocation.toLowerCase();
    const actual = lead.location.toLowerCase();
    if (actual.includes(expected) || expected.includes(actual)) {
      score += 10;
      reasons.push('location_match');
    }
  }

  if (lead.emails.length > 0) {
    score += 15;
    reasons.push('has_email');
  }

  if (lead.socialLinks.length > 0) {
    score += 10;
    reasons.push('has_social_link');
  }

  if (lead.name) {
    score += 5;
    reasons.push('has_name');
  }

  return { score: clamp(score), reasons };
};
