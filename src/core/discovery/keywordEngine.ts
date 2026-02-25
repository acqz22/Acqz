export type SupportedPlatform = 'google' | 'bing' | 'maps' | 'yelp' | string;

export interface KeywordEngineInput {
  seedKeywords: string[];
  location: string;
  niche: string;
  language?: string;
}

export interface ScoredKeyword {
  keyword: string;
  score: number;
  relevance: number;
  intent: number;
}

export interface PlatformAdapterPayload {
  platform: SupportedPlatform;
  queries: string[];
  keywords: ScoredKeyword[];
  input: KeywordEngineInput;
}

export interface PlatformAdapterResult<T = unknown> {
  platform: SupportedPlatform;
  payload: T;
}

export interface PlatformAdapter<T = unknown> {
  platform: SupportedPlatform;
  search(payload: PlatformAdapterPayload): Promise<PlatformAdapterResult<T>>;
}

export interface KeywordEngineOptions {
  ttlMs?: number;
  topN?: number;
  languageFallback?: string;
  platformTemplates?: Record<SupportedPlatform, string | ((keyword: string, input: KeywordEngineInput) => string)>;
}

type CacheRecord = {
  expiresAt: number;
  expansions: string[];
};

/**
 * KeywordEngine expands seed keywords deterministically, scores results,
 * and dispatches curated keyword queries to platform adapters.
 */
export class KeywordEngine {
  private readonly ttlMs: number;
  private readonly topN: number;
  private readonly languageFallback: string;
  private readonly platformTemplates: KeywordEngineOptions['platformTemplates'];
  private readonly cache = new Map<string, CacheRecord>();
  private readonly adapters = new Map<SupportedPlatform, PlatformAdapter>();

  private readonly serviceModifiers = [
    'best',
    'affordable',
    'top rated',
    'professional',
    'same day',
    '24/7',
    'licensed',
    'trusted',
  ];

  private readonly localSynonyms = [
    'near me',
    'local',
    'nearby',
    'in town',
    'closest',
  ];

  constructor(options: KeywordEngineOptions = {}) {
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000;
    this.topN = options.topN ?? 12;
    this.languageFallback = options.languageFallback ?? 'en';
    this.platformTemplates = options.platformTemplates ?? {
      google: '{keyword}',
      bing: '{keyword}',
      maps: '{keyword} in {location}',
      yelp: '{keyword} {location}',
    };
  }

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  clearExpiredCache(now = Date.now()): void {
    for (const [key, record] of this.cache.entries()) {
      if (record.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  async discover(
    input: KeywordEngineInput,
    requestedPlatforms: SupportedPlatform[],
    topN = this.topN,
  ): Promise<PlatformAdapterResult[]> {
    const normalizedInput = this.normalizeInput(input);
    const expanded = this.expandAll(normalizedInput);
    const scored = this.scoreKeywords(expanded, normalizedInput).slice(0, topN);

    const tasks = requestedPlatforms.map(async (platform) => {
      const adapter = this.adapters.get(platform);
      if (!adapter) {
        throw new Error(`No adapter registered for platform: ${platform}`);
      }

      const queries = this.buildPlatformQueries(platform, scored, normalizedInput);
      return adapter.search({
        platform,
        queries,
        keywords: scored,
        input: normalizedInput,
      });
    });

    return Promise.all(tasks);
  }

  expandAll(input: KeywordEngineInput): string[] {
    const expansions = new Set<string>();
    for (const seed of input.seedKeywords) {
      const normalizedSeed = seed.trim().toLowerCase();
      if (!normalizedSeed) {
        continue;
      }

      const cacheKey = this.makeCacheKey(normalizedSeed, input.location);
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        cached.expansions.forEach((k) => expansions.add(k));
        continue;
      }

      const generated = this.expandSeed(normalizedSeed, input);
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + this.ttlMs,
        expansions: generated,
      });

      generated.forEach((k) => expansions.add(k));
    }

    return Array.from(expansions);
  }

  scoreKeywords(keywords: string[], input: KeywordEngineInput): ScoredKeyword[] {
    const niche = input.niche.toLowerCase();
    const location = input.location.toLowerCase();

    const scored = keywords.map((keyword) => {
      const lowerKeyword = keyword.toLowerCase();

      const relevance = this.computeRelevance(lowerKeyword, niche, location);
      const intent = this.computeIntent(lowerKeyword);
      const score = Number((relevance * 0.65 + intent * 0.35).toFixed(4));

      return { keyword, relevance, intent, score };
    });

    return scored.sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword));
  }

  private buildPlatformQueries(
    platform: SupportedPlatform,
    keywords: ScoredKeyword[],
    input: KeywordEngineInput,
  ): string[] {
    const template = this.platformTemplates?.[platform] ?? '{keyword}';

    return keywords.map(({ keyword }) => {
      if (typeof template === 'function') {
        return template(keyword, input);
      }

      return template
        .replace('{keyword}', keyword)
        .replace('{location}', input.location)
        .replace('{niche}', input.niche)
        .replace('{language}', input.language ?? this.languageFallback);
    });
  }

  private expandSeed(seed: string, input: KeywordEngineInput): string[] {
    const variants = new Set<string>([seed]);

    const plural = this.toPlural(seed);
    const singular = this.toSingular(seed);

    variants.add(plural);
    variants.add(singular);

    for (const modifier of this.serviceModifiers) {
      variants.add(`${modifier} ${seed}`);
      variants.add(`${seed} ${modifier}`);
      variants.add(`${modifier} ${plural}`);
    }

    // Deterministic local intent variants.
    variants.add(`${seed} near me`);
    variants.add(`${seed} in ${input.location.toLowerCase()}`);
    variants.add(`${seed} near ${input.location.toLowerCase()}`);

    for (const localWord of this.localSynonyms) {
      variants.add(`${localWord} ${seed}`);
      variants.add(`${seed} ${localWord}`);
    }

    // Niche bridge terms help tie broad seeds back to target market intent.
    variants.add(`${seed} ${input.niche.toLowerCase()}`);
    variants.add(`${input.niche.toLowerCase()} ${seed}`);

    return Array.from(variants).map((v) => v.trim()).filter(Boolean);
  }

  private computeRelevance(keyword: string, niche: string, location: string): number {
    let relevance = 0.3;

    if (keyword.includes(niche)) relevance += 0.35;
    if (keyword.includes(location)) relevance += 0.2;
    if (keyword.includes('near me') || keyword.includes('nearby') || keyword.includes('local')) relevance += 0.15;

    return Math.min(1, Number(relevance.toFixed(4)));
  }

  private computeIntent(keyword: string): number {
    let intent = 0.25;
    const highIntentMarkers = ['best', 'top rated', 'affordable', 'same day', '24/7', 'licensed', 'trusted'];

    for (const marker of highIntentMarkers) {
      if (keyword.includes(marker)) {
        intent += 0.1;
      }
    }

    if (keyword.includes('near me') || keyword.includes('in ')) {
      intent += 0.2;
    }

    return Math.min(1, Number(intent.toFixed(4)));
  }

  private toPlural(term: string): string {
    if (term.endsWith('y')) return `${term.slice(0, -1)}ies`;
    if (term.endsWith('s')) return `${term}es`;
    return `${term}s`;
  }

  private toSingular(term: string): string {
    if (term.endsWith('ies')) return `${term.slice(0, -3)}y`;
    if (term.endsWith('es')) return term.slice(0, -2);
    if (term.endsWith('s')) return term.slice(0, -1);
    return term;
  }

  private normalizeInput(input: KeywordEngineInput): KeywordEngineInput {
    return {
      ...input,
      language: input.language?.trim().toLowerCase() || this.languageFallback,
      location: input.location.trim(),
      niche: input.niche.trim(),
      seedKeywords: input.seedKeywords.map((k) => k.trim()).filter(Boolean),
    };
  }

  private makeCacheKey(seed: string, location: string): string {
    return `${seed}::${location.trim().toLowerCase()}`;
  }
}
