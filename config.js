import axios from 'axios';

function parseKeyValueList(raw = '') {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const [key, ...rest] = entry.split(':');
      if (!key || rest.length === 0) return acc;
      acc[key.trim()] = rest.join(':').trim();
      return acc;
    }, {});
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function loadRuntimeConfig() {
  const envSigningKeys = parseJson(process.env.SCRAPER_SIGNING_KEYS_JSON, null)
    || parseKeyValueList(process.env.SCRAPER_SIGNING_KEYS);

  const envApiKeys = parseJson(process.env.CLIENT_API_KEYS_JSON, null)
    || parseKeyValueList(process.env.CLIENT_API_KEYS);

  const baseConfig = {
    port: Number(process.env.PORT || 10000),
    zenrowsApiKey: process.env.ZENROWS_API_KEY,
    signingKeys: envSigningKeys,
    apiKeys: envApiKeys,
    activeSigningKeyId: process.env.ACTIVE_SIGNING_KEY_ID || Object.keys(envSigningKeys)[0],
    allowedPlatforms: (process.env.ALLOWED_PLATFORMS || '')
      .split(',')
      .map((platform) => platform.trim())
      .filter(Boolean),
    defaultRetentionDays: Number(process.env.DEFAULT_RETENTION_DAYS || 30),
    retentionCleanupMs: Number(process.env.RETENTION_CLEANUP_MS || 60_000),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 30),
    abuseLockMs: Number(process.env.ABUSE_LOCK_MS || 5 * 60_000),
    enforceRobotsAwareMode: process.env.ENFORCE_ROBOTS_AWARE_MODE === 'true',
    enforceTosAwareMode: process.env.ENFORCE_TOS_AWARE_MODE === 'true',
    secretProvider: process.env.SECRET_PROVIDER || 'env',
    vaultAddress: process.env.VAULT_ADDR,
    vaultToken: process.env.VAULT_TOKEN,
    vaultSecretPath: process.env.VAULT_SECRET_PATH,
  };

  if (baseConfig.secretProvider !== 'vault') {
    return baseConfig;
  }

  if (!baseConfig.vaultAddress || !baseConfig.vaultToken || !baseConfig.vaultSecretPath) {
    throw new Error('Vault provider selected but VAULT_ADDR/VAULT_TOKEN/VAULT_SECRET_PATH are missing');
  }

  const vaultUrl = `${baseConfig.vaultAddress.replace(/\/$/, '')}/v1/${baseConfig.vaultSecretPath}`;
  const { data } = await axios.get(vaultUrl, {
    headers: { 'X-Vault-Token': baseConfig.vaultToken },
    timeout: 10_000,
  });

  const vaultData = data?.data?.data || data?.data || {};
  const mergedSigningKeys = parseJson(vaultData.SCRAPER_SIGNING_KEYS_JSON, baseConfig.signingKeys);
  const mergedApiKeys = parseJson(vaultData.CLIENT_API_KEYS_JSON, baseConfig.apiKeys);

  return {
    ...baseConfig,
    zenrowsApiKey: vaultData.ZENROWS_API_KEY || baseConfig.zenrowsApiKey,
    signingKeys: mergedSigningKeys,
    apiKeys: mergedApiKeys,
    activeSigningKeyId: vaultData.ACTIVE_SIGNING_KEY_ID || baseConfig.activeSigningKeyId,
  };
}
