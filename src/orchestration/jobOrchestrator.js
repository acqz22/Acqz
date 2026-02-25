import { getAdapter } from '../adapters/index.js';
import { expandKeywords, rankKeywords } from '../core/discovery/keywordEngine.js';
import { normalizeLead } from '../core/normalization/leadNormalizer.js';
import { dedupeLeads } from '../core/dedupe/leadDedupe.js';

const jobs = new Map();

export function createJob(input) {
  const job = {
    id: input.requestId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    input,
    output: null,
    errors: [],
  };
  jobs.set(job.id, job);
  runJob(job).catch((error) => {
    job.status = 'failed';
    job.errors.push(error.message);
  });
  return job;
}

export function getJob(jobId) {
  return jobs.get(jobId);
}

async function runJob(job) {
  const { input } = job;
  job.status = 'running';
  const expanded = expandKeywords(input.keywords, input.location);
  const rankedKeywords = rankKeywords(expanded, input.leadCount);
  const budgetPerPlatform = Math.max(1, Math.ceil(input.leadCount / input.platforms.length));

  const rawLeads = [];
  for (const platform of input.platforms) {
    const adapter = getAdapter(platform);
    for (const { keyword } of rankedKeywords) {
      if (rawLeads.length >= input.leadCount * 2) break;
      try {
        const leads = await adapter.searchLeads({
          keyword,
          location: input.location,
          limit: Math.min(20, budgetPerPlatform),
          zenrowsApiKey: process.env.ZENROWS_API_KEY,
        });
        rawLeads.push(...leads.map((lead) => ({ ...lead, platform, keyword })));
      } catch (error) {
        job.errors.push(`${platform} (${keyword}): ${error.message}`);
      }
    }
  }

  const normalized = rawLeads
    .map((lead) => normalizeLead(lead, { platform: lead.platform, location: input.location, keyword: lead.keyword }))
    .filter((lead) => lead.confidence >= input.minimumConfidence);

  const deduped = input.dedupe ? dedupeLeads(normalized) : { leads: normalized, dedupeStats: null };

  job.output = {
    requestId: input.requestId,
    status: 'completed',
    totalFound: rawLeads.length,
    totalReturned: Math.min(input.leadCount, deduped.leads.length),
    leads: deduped.leads.slice(0, input.leadCount),
    dedupeStats: deduped.dedupeStats,
    errors: job.errors,
  };
  job.status = 'completed';
}
