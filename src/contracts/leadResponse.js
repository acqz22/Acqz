import { z } from 'zod';

const statusSchema = z.enum(['queued', 'running', 'success', 'partial_success', 'failed']);

const leadSchema = z.object({
  platform: z.string().min(1),
  title: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  phone: z.string().min(3).optional(),
  address: z.string().min(2).optional(),
  website: z.string().url().optional(),
  profileUrl: z.string().url().optional(),
  socials: z.array(z.object({
    network: z.string().min(1),
    url: z.string().url()
  })).optional(),
  metadata: z.record(z.unknown()).optional()
}).passthrough();

const platformSummarySchema = z.object({
  platform: z.string().min(1),
  found: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  limitedBy: z.enum(['none', 'per_platform', 'request_total']).default('none')
});

const errorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  platform: z.string().optional(),
  retryable: z.boolean().default(false),
  details: z.record(z.unknown()).optional()
});

const timingsSchema = z.object({
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  perPlatformMs: z.record(z.number().int().nonnegative()).default({})
});

export const leadResponseSchema = z.object({
  requestId: z.string().min(1),
  status: statusSchema,
  totalFound: z.number().int().nonnegative(),
  totalReturned: z.number().int().nonnegative(),
  leads: z.array(leadSchema),
  byPlatform: z.array(platformSummarySchema),
  errors: z.array(errorSchema).default([]),
  timings: timingsSchema
});
