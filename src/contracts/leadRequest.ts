import { z } from 'zod';

export const MAX_LEAD_COUNT_PER_REQUEST = 500;
export const MAX_LEAD_COUNT_PER_PLATFORM = 100;

const SUPPORTED_PLATFORMS = [
  'google_maps',
  'instagram',
  'linkedin',
  'facebook',
  'meta_ads',
  'google_ads',
  'google_search',
  'youtube',
  'twitter',
  'yellowpages',
  'justdial',
  'tiktok'
] as const;

const accountTypeSchema = z.enum(['business', 'creator', 'individual']);
const recencyUnitSchema = z.enum(['hours', 'days', 'weeks', 'months']);

const ratingRangeSchema = z
  .object({
    min: z.number().min(0).max(5).optional(),
    max: z.number().min(0).max(5).optional()
  })
  .refine((value) => (value.min ?? 0) <= (value.max ?? 5), {
    message: 'filters.rating.min must be less than or equal to filters.rating.max',
    path: ['max']
  });

const recencySchema = z.object({
  value: z.number().int().positive().max(3650),
  unit: recencyUnitSchema.default('days')
});

const filterSchema = z
  .preprocess((raw) => {
    if (!raw || typeof raw !== 'object') return {};
    const input = raw as Record<string, unknown>;

    const ratingMin = input.ratingMin;
    const ratingMax = input.ratingMax;
    const hasRatingRange = ratingMin !== undefined || ratingMax !== undefined;

    const recencyDays = input.recencyDays;
    const hasRecencyDays = typeof recencyDays === 'number';

    return {
      ...input,
      rating: input.rating ??
        (hasRatingRange
          ? {
              min: typeof ratingMin === 'number' ? ratingMin : undefined,
              max: typeof ratingMax === 'number' ? ratingMax : undefined
            }
          : undefined),
      language:
        typeof input.language === 'string'
          ? [input.language]
          : Array.isArray(input.language)
            ? input.language
            : undefined,
      recency: input.recency ??
        (hasRecencyDays
          ? {
              value: recencyDays,
              unit: 'days'
            }
          : undefined),
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
  }).strip())
  .default({});

const dedupeSchema = z
  .union([
    z.boolean(),
    z.object({
      enabled: z.boolean().default(true),
      by: z.array(z.enum(['name', 'phone', 'url', 'platform'])).min(1).max(4).default(['name', 'phone'])
    })
  ])
  .default(true)
  .transform((input) => {
    if (typeof input === 'boolean') {
      return {
        enabled: input,
        by: ['name', 'phone'] as const
      };
    }

    return {
      enabled: input.enabled,
      by: input.by
    };
  });

export const leadRequestSchema = z
  .object({
    requestId: z.string().trim().min(1).max(120),
    platforms: z.array(z.enum(SUPPORTED_PLATFORMS)).min(1).max(10),
    keywords: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    location: z.string().trim().min(1).max(160),
    leadCount: z.number().int().positive().max(MAX_LEAD_COUNT_PER_REQUEST).default(40),
    filters: filterSchema,
    extractDetails: z.boolean().default(true),
    extractSocialLinks: z.boolean().default(false),
    timeoutMs: z.number().int().min(5_000).max(120_000).default(40_000),
    dedupe: dedupeSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    const perPlatform = Math.ceil(value.leadCount / value.platforms.length);
    if (perPlatform > MAX_LEAD_COUNT_PER_PLATFORM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `leadCount is too high for selected platforms. Maximum per platform is ${MAX_LEAD_COUNT_PER_PLATFORM}`,
        path: ['leadCount']
      });
    }
  });

export type LeadRequest = z.infer<typeof leadRequestSchema>;

export const leadRequestJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId', 'platforms', 'keywords', 'location'],
  properties: {
    requestId: { type: 'string', minLength: 1, maxLength: 120 },
    platforms: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: { type: 'string', enum: [...SUPPORTED_PLATFORMS] }
    },
    keywords: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 120 }
    },
    location: { type: 'string', minLength: 1, maxLength: 160 },
    leadCount: { type: 'integer', minimum: 1, maximum: MAX_LEAD_COUNT_PER_REQUEST, default: 40 },
    filters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rating: {
          type: 'object',
          additionalProperties: false,
          properties: {
            min: { type: 'number', minimum: 0, maximum: 5 },
            max: { type: 'number', minimum: 0, maximum: 5 }
          }
        },
        language: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
        verifiedOnly: { type: 'boolean' },
        accountType: {
          oneOf: [
            { type: 'string', enum: ['business', 'creator', 'individual'] },
            { type: 'array', items: { type: 'string', enum: ['business', 'creator', 'individual'] } }
          ]
        },
        recency: {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'unit'],
          properties: {
            value: { type: 'integer', minimum: 1, maximum: 3650 },
            unit: { type: 'string', enum: ['hours', 'days', 'weeks', 'months'] }
          }
        },
        hasWebsite: { type: 'boolean' },
        hasPhone: { type: 'boolean' },
        includeTerms: { type: 'array', items: { type: 'string' }, maxItems: 25 },
        excludeTerms: { type: 'array', items: { type: 'string' }, maxItems: 25 }
      }
    },
    extractDetails: { type: 'boolean', default: true },
    extractSocialLinks: { type: 'boolean', default: false },
    timeoutMs: { type: 'integer', minimum: 5000, maximum: 120000, default: 40000 },
    dedupe: {
      oneOf: [
        { type: 'boolean' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean', default: true },
            by: {
              type: 'array',
              items: { type: 'string', enum: ['name', 'phone', 'url', 'platform'] },
              minItems: 1,
              maxItems: 4
            }
          }
        }
      ]
    }
  }
} as const;
