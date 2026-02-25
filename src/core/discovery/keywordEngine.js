const modifiers = ['services', 'agency', 'company', 'near me', 'contact', 'phone', 'email'];

export function expandKeywords(seedKeywords, location) {
  const expanded = new Set();
  for (const keyword of seedKeywords) {
    expanded.add(keyword);
    for (const modifier of modifiers) {
      expanded.add(`${keyword} ${modifier}`.trim());
      expanded.add(`${keyword} ${location}`.trim());
    }
  }
  return [...expanded];
}

export function rankKeywords(keywords, leadCount) {
  return keywords
    .map((keyword) => ({ keyword, score: keyword.length < 40 ? 1 : 0.6 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(10, Math.ceil(leadCount / 5)));
}
