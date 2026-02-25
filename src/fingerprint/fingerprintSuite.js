const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36',
];

export function buildRequestFingerprint(seed = Date.now()) {
  const userAgent = userAgents[Math.abs(seed) % userAgents.length];
  return {
    headers: {
      'user-agent': userAgent,
      'accept-language': 'en-US,en;q=0.9',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'cache-control': 'no-cache',
    },
    meta: {
      userAgentFamily: userAgent.includes('Safari') && !userAgent.includes('Chrome') ? 'safari' : 'chromium',
      timezone: 'UTC',
    },
  };
}
