import crypto from 'crypto';

export function createAuthMiddleware(config) {
  const allowedSkewMs = 5 * 60_000;

  return (req, res, next) => {
    const apiKeyId = req.header('x-api-key-id');
    const apiKey = req.header('x-api-key');
    const keyId = req.header('x-signing-key-id');
    const timestamp = req.header('x-signature-timestamp');
    const signature = req.header('x-signature');
    const nonce = req.header('x-signature-nonce') || '';

    if (!apiKeyId || !apiKey || !keyId || !timestamp || !signature) {
      return res.status(401).json({ success: false, error: 'Missing auth headers' });
    }

    if (config.apiKeys[apiKeyId] !== apiKey) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    const signingSecret = config.signingKeys[keyId];
    if (!signingSecret) {
      return res.status(401).json({ success: false, error: 'Unknown signing key id' });
    }

    const timestampMs = Number(timestamp);
    if (Number.isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > allowedSkewMs) {
      return res.status(401).json({ success: false, error: 'Signature timestamp outside allowed skew' });
    }

    const payload = `${req.method}\n${req.path}\n${timestamp}\n${nonce}\n${JSON.stringify(req.body || {})}`;
    const expected = crypto.createHmac('sha256', signingSecret).update(payload).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      return res.status(401).json({ success: false, error: 'Signature verification failed' });
    }

    req.auth = { apiKeyId, signingKeyId: keyId };
    next();
  };
}
