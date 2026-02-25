import { createHash } from 'node:crypto';

export interface LeadRecord {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  domain?: string;
  city?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  extractedAt?: string;
  [key: string]: unknown;
}

export interface LeadProvenance {
  sourcePlatforms: string[];
  sourceUrls: string[];
  extractionTimestamps: string[];
}

export interface DedupeLead extends LeadRecord {
  fingerprint: string;
  mergedFromCount: number;
  provenance: LeadProvenance;
}

export interface DedupeStats {
  before: number;
  after: number;
  merged: number;
}

export interface DedupeOutput {
  leads: DedupeLead[];
  dedupeStats: DedupeStats;
}

const EMPTY_TOKEN = 'na';
const FUZZY_MATCH_THRESHOLD = 0.84;

function normalizeText(value?: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeName(name?: string): string {
  return normalizeText(name)
    .replace(/[^a-z0-9\s]/g, '')
    .split(' ')
    .filter(Boolean)
    .join(' ');
}

function normalizeEmail(email?: string): string {
  const normalized = normalizeText(email);
  if (!normalized.includes('@')) return '';

  const [local = '', domain = ''] = normalized.split('@');
  const cleanLocal = local.replace(/\./g, '');
  return `${cleanLocal}@${domain}`;
}

function normalizePhone(phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeDomain(value?: string): string {
  const raw = normalizeText(value)
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  if (!raw) return '';
  return raw;
}

function safeIsoTimestamp(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
}

function tokenize(value: string): string[] {
  return value.split(' ').map((token) => token.trim()).filter(Boolean);
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinDistance(a: string, b: string): number {
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, idx) => idx);
  const current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function normalizedEditSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function computeFuzzyScore(left: LeadRecord, right: LeadRecord): number {
  const leftName = normalizeName(left.name);
  const rightName = normalizeName(right.name);
  const leftCity = normalizeText(left.city);
  const rightCity = normalizeText(right.city);
  const leftDomain = normalizeDomain(left.domain ?? left.website);
  const rightDomain = normalizeDomain(right.domain ?? right.website);
  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);

  const nameTokenScore = jaccardSimilarity(leftName, rightName);
  const nameEditScore = normalizedEditSimilarity(leftName, rightName);
  const cityScore = leftCity && rightCity && leftCity === rightCity ? 1 : 0;
  const domainScore = leftDomain && rightDomain && leftDomain === rightDomain ? 1 : 0;
  const phoneScore = leftPhone && rightPhone && leftPhone === rightPhone ? 1 : 0;

  const weighted =
    nameTokenScore * 0.36 +
    nameEditScore * 0.24 +
    cityScore * 0.16 +
    domainScore * 0.16 +
    phoneScore * 0.08;

  return Math.max(weighted, domainScore, phoneScore);
}

export function buildLeadFingerprint(lead: LeadRecord): string {
  const normalizedName = normalizeName(lead.name) || EMPTY_TOKEN;
  const normalizedPhone = normalizePhone(lead.phone) || EMPTY_TOKEN;
  const normalizedEmail = normalizeEmail(lead.email) || EMPTY_TOKEN;
  const normalizedDomain = normalizeDomain(lead.domain ?? lead.website) || EMPTY_TOKEN;
  const normalizedCity = normalizeText(lead.city) || EMPTY_TOKEN;

  const rawFingerprint = [normalizedName, normalizedPhone, normalizedEmail, normalizedDomain, normalizedCity].join('|');
  return createHash('sha256').update(rawFingerprint).digest('hex');
}

function mergeLeadGroup(leads: LeadRecord[]): DedupeLead {
  const base = { ...leads[0] };

  const bestName = leads
    .map((lead) => lead.name ?? '')
    .sort((a, b) => b.length - a.length)[0];

  const bestEmail = leads.find((lead) => normalizeEmail(lead.email))?.email;
  const bestPhone = leads.find((lead) => normalizePhone(lead.phone))?.phone;
  const bestDomain = leads.find((lead) => normalizeDomain(lead.domain ?? lead.website))?.domain;
  const bestWebsite = leads.find((lead) => normalizeDomain(lead.website))?.website;
  const bestCity = leads.find((lead) => normalizeText(lead.city))?.city;

  const sourcePlatforms = uniqueSorted(leads.map((lead) => normalizeText(lead.sourcePlatform)));
  const sourceUrls = uniqueSorted(leads.map((lead) => normalizeText(lead.sourceUrl)));
  const extractionTimestamps = uniqueSorted(leads.map((lead) => safeIsoTimestamp(lead.extractedAt)));

  const mergedLead: DedupeLead = {
    ...base,
    name: bestName || base.name,
    email: bestEmail ?? base.email,
    phone: bestPhone ?? base.phone,
    domain: bestDomain ?? base.domain,
    website: bestWebsite ?? base.website,
    city: bestCity ?? base.city,
    sourcePlatform: sourcePlatforms.join(', '),
    fingerprint: '',
    mergedFromCount: leads.length,
    provenance: {
      sourcePlatforms,
      sourceUrls,
      extractionTimestamps,
    },
  };

  mergedLead.fingerprint = buildLeadFingerprint(mergedLead);
  return mergedLead;
}

export function dedupeLeads(inputLeads: LeadRecord[]): DedupeOutput {
  const exactBuckets = new Map<string, LeadRecord[]>();

  for (const lead of inputLeads) {
    const key = buildLeadFingerprint(lead);
    const bucket = exactBuckets.get(key);
    if (bucket) {
      bucket.push(lead);
    } else {
      exactBuckets.set(key, [lead]);
    }
  }

  const exactMerged = [...exactBuckets.values()].map(mergeLeadGroup);

  const fuzzyMerged: DedupeLead[] = [];
  for (const lead of exactMerged) {
    const existingIndex = fuzzyMerged.findIndex(
      (candidate) => computeFuzzyScore(candidate, lead) >= FUZZY_MATCH_THRESHOLD,
    );

    if (existingIndex === -1) {
      fuzzyMerged.push(lead);
      continue;
    }

    const merged = mergeLeadGroup([fuzzyMerged[existingIndex], lead]);
    merged.mergedFromCount = fuzzyMerged[existingIndex].mergedFromCount + lead.mergedFromCount;
    merged.fingerprint = buildLeadFingerprint(merged);
    fuzzyMerged[existingIndex] = merged;
  }

  const before = inputLeads.length;
  const after = fuzzyMerged.length;

  return {
    leads: fuzzyMerged,
    dedupeStats: {
      before,
      after,
      merged: before - after,
    },
  };
}
