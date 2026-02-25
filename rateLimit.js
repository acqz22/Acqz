export function createRateLimiter(config) {
  const state = new Map();

  return (req, res, next) => {
    const apiKeyId = req.auth?.apiKeyId || 'anonymous';
    const now = Date.now();
    const current = state.get(apiKeyId) || {
      windowStart: now,
      count: 0,
      violations: 0,
      lockedUntil: 0,
    };

    if (current.lockedUntil > now) {
      return res.status(429).json({
        success: false,
        error: 'API key temporarily locked due to abuse',
        retryAfterMs: current.lockedUntil - now,
      });
    }

    if (now - current.windowStart >= config.rateLimitWindowMs) {
      current.windowStart = now;
      current.count = 0;
    }

    current.count += 1;

    if (current.count > config.rateLimitMaxRequests) {
      current.violations += 1;
      if (current.violations >= 3) {
        current.lockedUntil = now + config.abuseLockMs;
      }
      state.set(apiKeyId, current);
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        maxRequests: config.rateLimitMaxRequests,
        windowMs: config.rateLimitWindowMs,
      });
    }

    state.set(apiKeyId, current);
    res.setHeader('x-rate-limit-limit', String(config.rateLimitMaxRequests));
    res.setHeader('x-rate-limit-remaining', String(Math.max(0, config.rateLimitMaxRequests - current.count)));
    next();
  };
}
