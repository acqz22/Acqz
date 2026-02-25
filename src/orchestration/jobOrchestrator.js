import pLimit from 'p-limit';
import { scrapePlatformKeyword } from '../scraping/platformScraper.js';

const DEFAULTS = {
  globalConcurrency: 8,
  perPlatformConcurrency: 2,
  perRequestTimeoutMs: 40_000,
  jobTimeoutMs: 120_000,
  maxLeadsPerTask: 40,
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (error.name === 'AbortError') return 'Aborted due to timeout budget';
  return error.message || String(error);
}

export async function runJob({
  platforms,
  location,
  search,
  rankedKeywords = [],
  maxLeadsPerPlatform,
  zenrowsApiKey,
  config = {},
}) {
  const opts = {
    ...DEFAULTS,
    ...config,
  };

  const normalizedPlatforms = Array.isArray(platforms) ? platforms : [platforms];
  const keywords = (rankedKeywords.length ? rankedKeywords : [search]).filter(Boolean);
  const maxLeads = Math.min(Number.parseInt(maxLeadsPerPlatform, 10) || opts.maxLeadsPerTask, 80);

  const jobStart = Date.now();
  const deadline = jobStart + opts.jobTimeoutMs;
  const jobController = new AbortController();
  const globalLimit = pLimit(opts.globalConcurrency);
  const platformLimiters = new Map(normalizedPlatforms.map((p) => [p, pLimit(opts.perPlatformConcurrency)]));

  const queueByPlatform = new Map(
    normalizedPlatforms.map((platform) => [
      platform,
      keywords.map((keyword) => ({ platform, keyword })),
    ]),
  );

  const metadata = {
    startedAt: new Date(jobStart).toISOString(),
    completedAt: null,
    timedOut: false,
    durationMs: 0,
    config: {
      globalConcurrency: opts.globalConcurrency,
      perPlatformConcurrency: opts.perPlatformConcurrency,
      perRequestTimeoutMs: opts.perRequestTimeoutMs,
      jobTimeoutMs: opts.jobTimeoutMs,
      maxLeads,
    },
    totals: {
      scheduledTasks: normalizedPlatforms.length * keywords.length,
      completedTasks: 0,
      failedTasks: 0,
      cancelledTasks: 0,
      totalLeads: 0,
    },
    taskMetrics: [],
  };

  const resultsByPlatform = Object.fromEntries(normalizedPlatforms.map((platform) => [platform, []]));
  const inFlight = new Set();

  const timeoutHandle = setTimeout(() => {
    metadata.timedOut = true;
    jobController.abort(new Error('Job timeout budget exceeded'));
  }, opts.jobTimeoutMs);

  const runTask = ({ platform, keyword }) =>
    globalLimit(() =>
      platformLimiters.get(platform)(async () => {
        const taskStartedAt = Date.now();
        const remainingBudgetMs = Math.max(deadline - taskStartedAt, 0);

        if (jobController.signal.aborted || remainingBudgetMs <= 0) {
          metadata.totals.cancelledTasks += 1;
          metadata.taskMetrics.push({
            platform,
            keyword,
            status: 'cancelled',
            durationMs: 0,
            error: 'Skipped due to exhausted timeout budget',
          });
          return;
        }

        const taskController = new AbortController();
        const linkedAbort = () => taskController.abort(jobController.signal.reason);
        jobController.signal.addEventListener('abort', linkedAbort, { once: true });
        const effectiveTimeoutMs = Math.min(opts.perRequestTimeoutMs, remainingBudgetMs);

        try {
          const leads = await scrapePlatformKeyword({
            platform,
            keyword,
            location,
            maxLeads,
            zenrowsApiKey,
            signal: taskController.signal,
            requestTimeoutMs: effectiveTimeoutMs,
          });

          resultsByPlatform[platform].push(...leads);
          metadata.totals.totalLeads += leads.length;
          metadata.totals.completedTasks += 1;
          metadata.taskMetrics.push({
            platform,
            keyword,
            status: 'ok',
            durationMs: Date.now() - taskStartedAt,
            leads: leads.length,
          });
        } catch (error) {
          const status = taskController.signal.aborted ? 'cancelled' : 'failed';
          if (status === 'cancelled') {
            metadata.totals.cancelledTasks += 1;
          } else {
            metadata.totals.failedTasks += 1;
          }
          metadata.taskMetrics.push({
            platform,
            keyword,
            status,
            durationMs: Date.now() - taskStartedAt,
            error: toErrorMessage(error),
          });
        } finally {
          jobController.signal.removeEventListener('abort', linkedAbort);
        }
      }),
    );

  try {
    while (!jobController.signal.aborted) {
      let scheduled = false;

      for (const platform of normalizedPlatforms) {
        const queue = queueByPlatform.get(platform);
        const nextTask = queue.shift();
        if (!nextTask) continue;

        scheduled = true;
        const promise = runTask(nextTask).finally(() => inFlight.delete(promise));
        inFlight.add(promise);
      }

      if (!scheduled) break;

      if (inFlight.size >= opts.globalConcurrency) {
        await Promise.race(inFlight);
      } else {
        await delay(0);
      }
    }

    await Promise.allSettled([...inFlight]);
  } finally {
    clearTimeout(timeoutHandle);
    metadata.completedAt = new Date().toISOString();
    metadata.durationMs = Date.now() - jobStart;
  }

  for (const platform of normalizedPlatforms) {
    if (resultsByPlatform[platform].length === 0) {
      resultsByPlatform[platform] = [{ note: `${platform} - no public leads visible` }];
    }
  }

  return {
    resultsByPlatform,
    metadata,
    platformsUsed: normalizedPlatforms,
    rawLeads: Object.values(resultsByPlatform).flat(),
    totalLeads: metadata.totals.totalLeads,
  };
}
