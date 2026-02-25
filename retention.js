export function createRetentionStore({ defaultRetentionDays, cleanupMs }) {
  const records = [];

  const cleanup = () => {
    const now = Date.now();
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const entry = records[index];
      if (entry.expiresAt <= now) {
        records.splice(index, 1);
      }
    }
  };

  const timer = setInterval(cleanup, cleanupMs);
  timer.unref?.();

  return {
    add(result, retentionDays = defaultRetentionDays) {
      const safeRetention = Math.max(1, Math.min(365, Number(retentionDays) || defaultRetentionDays));
      const createdAt = Date.now();
      records.push({
        ...result,
        createdAt,
        expiresAt: createdAt + safeRetention * 24 * 60 * 60 * 1000,
      });
    },
    count() {
      cleanup();
      return records.length;
    },
    cleanup,
  };
}
