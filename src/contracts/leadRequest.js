import { z } from 'zod';

export const MAX_LEAD_COUNT_PER_REQUEST = 500;
export const MAX_LEAD_COUNT_PER_PLATFORM = 100;

const SUPPORTED_PLATFORMS = [
  'google_maps', 'instagram', 'linkedin', 'facebook', 'meta_ads', 'google_ads',
  'google_search', 'youtube', 'twitter', 'yellowpages', 'justdial', 'tiktok'
];

const accountTypeSchema = z.enum(['business', 'creator', 'individual']);
const recencyUnitSchema = z.enum(['hours', 'days', 'weeks', 'months']);

const ratingRangeSchema = z.object({
  min: z.number().min(0).max(5).optional(),
  max: z.number().min(0).max(5).optional()
}).refine((value) => (value.min ?? 0) <= (value.max ?? 5), {
  message: 'filters.rating.min must be less than or equal to filters.rating.max',
  path: ['max']
});

const recencySchema = z.object({
  value: z.number().int().positive().max(3650),
  unit: recencyUnitSchema.default('days')
});

const filterSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw;

  const ratingMin = input.ratingMin;
  const ratingMax = input.ratingMax;
  const hasRatingRange = ratingMin !== undefined || ratingMax !== undefined;

  const recencyDays = input.recencyDays;
  const hasRecencyDays = typeof recencyDays === 'number';

  return {
    ...input,
    rating: input.rating ?? (hasRatingRange ? {
      min: typeof ratingMin === 'number' ? ratingMin : undefined,
      max: typeof ratingMax === 'number' ? ratingMax : undefined
    } : undefined),
    language: typeof input.language === 'string'
      ? [input.language]
      : Array.isArray(input.language)
        ? input.language
        : undefined,
    recency: input.recency ?? (hasRecencyDays ? {
      value: recencyDays,
      unit: 'days'
    } : undefined),
    verifiedOnly: typeof input.verifiedOnly === 'boolean' ? input.verifiedOnly : undefined
  };
}, z.object({
  rating: ratingRangeSchema.optional(),
  language: z.array(z.string().trim().min(2).max(35)).min(1).max(10).optional(),
  verifiedOnly: z.boolean().optional(),
  accountType: z.union([accountTypeSchema, z.array(accountTypeSchema).min(1).max(3)]).optional(),
  recency: recencySchema.optional(),
  hasWebsite: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  excludeTerms: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  includeTerms: z.array(z.string().trim().min(1).max(80)).max(25).optional()
}).strip()).default({});

const dedupeSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean().default(true),
    by: z.array(z.enum(['name', 'phone', 'url', 'platform'])).min(1).max(4).default(['name', 'phone'])
  })
]).default(true).transform((input) => {
  if (typeof input === 'boolean') {
    return { enabled: input, by: ['name', 'phone'] };
  }
  return { enabled: input.enabled, by: input.by };
});

export const leadRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(120),
  platforms: z.array(z.enum(SUPPORTED_PLATFORMS)).min(1).max(10),
  keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  location: z.string().trim().min(1).max(160),
  leadCount: z.number().int().positive().max(MAX_LEAD_COUNT_PER_REQUEST).default(40),
  filters: filterSchema,
  extractDetails: z.boolean().default(true),
  extractSocialLinks: z.boolean().default(false),
  timeoutMs: z.number().int().min(5000).max(120000).default(40000),
  dedupe: dedupeSchema
}).strict().superRefine((value, ctx) => {
  const perPlatform = Math.ceil(value.leadCount / value.platforms.length);
  if (perPlatform > MAX_LEAD_COUNT_PER_PLATFORM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `leadCount is too high for selected platforms. Maximum per platform is ${MAX_LEAD_COUNT_PER_PLATFORM}`,
      path: ['leadCount']
    });
  }
});
