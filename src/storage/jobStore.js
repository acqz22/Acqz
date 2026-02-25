import { createClient } from 'redis';
import pg from 'pg';

const { Pool } = pg;

export const JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
});

const TERMINAL_STATUSES = new Set([
  JOB_STATUSES.COMPLETED,
  JOB_STATUSES.FAILED,
  JOB_STATUSES.EXPIRED,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [JOB_STATUSES.QUEUED]: new Set([JOB_STATUSES.RUNNING, JOB_STATUSES.EXPIRED]),
  [JOB_STATUSES.RUNNING]: new Set([JOB_STATUSES.COMPLETED, JOB_STATUSES.FAILED, JOB_STATUSES.EXPIRED]),
  [JOB_STATUSES.COMPLETED]: new Set(),
  [JOB_STATUSES.FAILED]: new Set(),
  [JOB_STATUSES.EXPIRED]: new Set(),
});

/**
 * @typedef {Object} JobRecord
 * @property {string} id
 * @property {string} status
 * @property {string} createdAt
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {string|null} failedAt
 * @property {string|null} expiredAt
 * @property {string|null} updatedAt
 * @property {string|null} expiresAt
 * @property {Object} payload
 * @property {Object|null} result
 * @property {Array<{message: string, at: string}>} errors
 */

function nowIso() {
  return new Date().toISOString();
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeJob(row) {
  if (!row) return null;
  return {
    ...row,
    payload: row.payload ?? {},
    result: row.result ?? null,
    errors: Array.isArray(row.errors) ? row.errors : [],
  };
}

function withStatusTimestamp(job, status, timestamp) {
  const patch = { status, updatedAt: timestamp };
  if (status === JOB_STATUSES.RUNNING) patch.startedAt = timestamp;
  if (status === JOB_STATUSES.COMPLETED) patch.completedAt = timestamp;
  if (status === JOB_STATUSES.FAILED) patch.failedAt = timestamp;
  if (status === JOB_STATUSES.EXPIRED) patch.expiredAt = timestamp;
  return patch;
}

function assertStatusTransition(from, to) {
  if (!ALLOWED_TRANSITIONS[from]?.has(to)) {
    throw new Error(`Invalid status transition: ${from} -> ${to}`);
  }
}

function createMemoryStore({ completedTtlSeconds }) {
  const jobs = new Map();

  function scheduleTtl(jobId, status) {
    if (!TERMINAL_STATUSES.has(status)) return;
    setTimeout(() => {
      const job = jobs.get(jobId);
      if (job && job.status === status) {
        jobs.delete(jobId);
      }
    }, completedTtlSeconds * 1000).unref();
  }

  return {
    async createJob({ id, payload = {}, status = JOB_STATUSES.QUEUED, createdAt = nowIso() }) {
      if (jobs.has(id)) throw new Error(`Job already exists: ${id}`);
      const record = {
        id,
        ...withStatusTimestamp(
          {
            status,
          },
          status,
          createdAt,
        ),
        createdAt,
        startedAt: status === JOB_STATUSES.RUNNING ? createdAt : null,
        completedAt: status === JOB_STATUSES.COMPLETED ? createdAt : null,
        failedAt: status === JOB_STATUSES.FAILED ? createdAt : null,
        expiredAt: status === JOB_STATUSES.EXPIRED ? createdAt : null,
        expiresAt: TERMINAL_STATUSES.has(status) ? new Date(Date.now() + completedTtlSeconds * 1000).toISOString() : null,
        payload,
        result: null,
        errors: [],
      };

      jobs.set(id, record);
      scheduleTtl(id, status);
      return normalizeJob(record);
    },

    async updateJob(id, patch = {}) {
      const current = jobs.get(id);
      if (!current) return null;

      const timestamp = nowIso();
      const next = { ...current, ...patch, updatedAt: timestamp };

      if (patch.status && patch.status !== current.status) {
        assertStatusTransition(current.status, patch.status);
        Object.assign(next, withStatusTimestamp(next, patch.status, timestamp));
      }

      if (next.status && TERMINAL_STATUSES.has(next.status)) {
        next.expiresAt = new Date(Date.now() + completedTtlSeconds * 1000).toISOString();
        scheduleTtl(id, next.status);
      }

      jobs.set(id, next);
      return normalizeJob(next);
    },

    async getJob(id) {
      return normalizeJob(jobs.get(id));
    },

    async appendError(id, message) {
      const current = jobs.get(id);
      if (!current) return null;
      const timestamp = nowIso();
      const next = {
        ...current,
        errors: [...current.errors, { message, at: timestamp }],
        updatedAt: timestamp,
      };
      jobs.set(id, next);
      return normalizeJob(next);
    },

    async cleanupExpiredJobs() {
      const now = Date.now();
      let removed = 0;
      for (const [id, job] of jobs.entries()) {
        if (job.expiresAt && new Date(job.expiresAt).getTime() <= now) {
          jobs.delete(id);
          removed += 1;
        }
      }
      return { removed };
    },

    async close() {},
  };
}

function createRedisStore({ redisUrl, completedTtlSeconds }) {
  const redis = createClient({ url: redisUrl });
  const keyForJob = (id) => `jobs:${id}`;

  async function ensureConnected() {
    if (!redis.isOpen) {
      await redis.connect();
    }
  }

  return {
    async createJob({ id, payload = {}, status = JOB_STATUSES.QUEUED, createdAt = nowIso() }) {
      await ensureConnected();
      const record = {
        id,
        status,
        createdAt,
        updatedAt: createdAt,
        startedAt: status === JOB_STATUSES.RUNNING ? createdAt : null,
        completedAt: status === JOB_STATUSES.COMPLETED ? createdAt : null,
        failedAt: status === JOB_STATUSES.FAILED ? createdAt : null,
        expiredAt: status === JOB_STATUSES.EXPIRED ? createdAt : null,
        expiresAt: TERMINAL_STATUSES.has(status) ? new Date(Date.now() + completedTtlSeconds * 1000).toISOString() : null,
        payload,
        result: null,
        errors: [],
      };

      const key = keyForJob(id);
      const isCreated = await redis.set(key, JSON.stringify(record), { NX: true });
      if (!isCreated) throw new Error(`Job already exists: ${id}`);

      if (TERMINAL_STATUSES.has(status)) {
        await redis.expire(key, completedTtlSeconds);
      }

      return record;
    },

    async updateJob(id, patch = {}) {
      await ensureConnected();
      const key = keyForJob(id);
      const raw = await redis.get(key);
      if (!raw) return null;

      const current = JSON.parse(raw);
      const timestamp = nowIso();
      const next = { ...current, ...patch, updatedAt: timestamp };

      if (patch.status && patch.status !== current.status) {
        assertStatusTransition(current.status, patch.status);
        Object.assign(next, withStatusTimestamp(next, patch.status, timestamp));
      }

      await redis.set(key, JSON.stringify(next));

      if (TERMINAL_STATUSES.has(next.status)) {
        next.expiresAt = new Date(Date.now() + completedTtlSeconds * 1000).toISOString();
        await redis.set(key, JSON.stringify(next), { EX: completedTtlSeconds });
      }

      return normalizeJob(next);
    },

    async getJob(id) {
      await ensureConnected();
      const raw = await redis.get(keyForJob(id));
      return raw ? normalizeJob(JSON.parse(raw)) : null;
    },

    async appendError(id, message) {
      const current = await this.getJob(id);
      if (!current) return null;
      const timestamp = nowIso();
      return this.updateJob(id, {
        errors: [...current.errors, { message, at: timestamp }],
      });
    },

    async cleanupExpiredJobs() {
      return { removed: 0, note: 'Redis TTL handles expiry automatically.' };
    },

    async close() {
      if (redis.isOpen) await redis.quit();
    },
  };
}

function createPostgresStore({ postgresUrl, completedTtlSeconds, retentionDays }) {
  const pool = new Pool({ connectionString: postgresUrl });

  async function ensureTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ NULL,
        completed_at TIMESTAMPTZ NULL,
        failed_at TIMESTAMPTZ NULL,
        expired_at TIMESTAMPTZ NULL,
        expires_at TIMESTAMPTZ NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        result JSONB NULL,
        errors JSONB NOT NULL DEFAULT '[]'::jsonb
      );
    `);
  }

  function fromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at?.toISOString() ?? null,
      updatedAt: row.updated_at?.toISOString() ?? null,
      startedAt: row.started_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      failedAt: row.failed_at?.toISOString() ?? null,
      expiredAt: row.expired_at?.toISOString() ?? null,
      expiresAt: row.expires_at?.toISOString() ?? null,
      payload: row.payload ?? {},
      result: row.result ?? null,
      errors: row.errors ?? [],
    };
  }

  return {
    async createJob({ id, payload = {}, status = JOB_STATUSES.QUEUED, createdAt = nowIso() }) {
      await ensureTable();
      const expiresAt = TERMINAL_STATUSES.has(status)
        ? new Date(Date.now() + completedTtlSeconds * 1000)
        : null;

      const query = `
        INSERT INTO jobs (
          id, status, created_at, updated_at, started_at, completed_at, failed_at, expired_at, expires_at, payload, result, errors
        ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, NULL, '[]'::jsonb)
        RETURNING *;
      `;

      const startedAt = status === JOB_STATUSES.RUNNING ? createdAt : null;
      const completedAt = status === JOB_STATUSES.COMPLETED ? createdAt : null;
      const failedAt = status === JOB_STATUSES.FAILED ? createdAt : null;
      const expiredAt = status === JOB_STATUSES.EXPIRED ? createdAt : null;

      const { rows } = await pool.query(query, [
        id,
        status,
        createdAt,
        startedAt,
        completedAt,
        failedAt,
        expiredAt,
        expiresAt,
        payload,
      ]);
      return fromRow(rows[0]);
    },

    async updateJob(id, patch = {}) {
      await ensureTable();
      const current = await this.getJob(id);
      if (!current) return null;

      const timestamp = nowIso();
      let nextStatus = current.status;
      if (patch.status && patch.status !== current.status) {
        assertStatusTransition(current.status, patch.status);
        nextStatus = patch.status;
      }

      const next = {
        ...current,
        ...patch,
        ...withStatusTimestamp(current, nextStatus, timestamp),
      };

      if (TERMINAL_STATUSES.has(next.status)) {
        next.expiresAt = new Date(Date.now() + completedTtlSeconds * 1000).toISOString();
      }

      const query = `
        UPDATE jobs
        SET
          status = $2,
          updated_at = $3,
          started_at = $4,
          completed_at = $5,
          failed_at = $6,
          expired_at = $7,
          expires_at = $8,
          payload = $9,
          result = $10,
          errors = $11::jsonb
        WHERE id = $1
        RETURNING *;
      `;

      const { rows } = await pool.query(query, [
        id,
        next.status,
        next.updatedAt,
        next.startedAt,
        next.completedAt,
        next.failedAt,
        next.expiredAt,
        next.expiresAt,
        next.payload,
        next.result,
        JSON.stringify(next.errors ?? []),
      ]);

      return fromRow(rows[0]);
    },

    async getJob(id) {
      await ensureTable();
      const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1 LIMIT 1;', [id]);
      return fromRow(rows[0]);
    },

    async appendError(id, message) {
      const current = await this.getJob(id);
      if (!current) return null;
      return this.updateJob(id, {
        errors: [...current.errors, { message, at: nowIso() }],
      });
    },

    async cleanupExpiredJobs() {
      await ensureTable();
      const { rowCount } = await pool.query(
        `
          DELETE FROM jobs
          WHERE status = ANY($1::text[])
          AND (
            (expires_at IS NOT NULL AND expires_at <= NOW())
            OR (updated_at <= NOW() - ($2 || ' days')::interval)
          );
        `,
        [[JOB_STATUSES.COMPLETED, JOB_STATUSES.FAILED, JOB_STATUSES.EXPIRED], retentionDays],
      );
      return { removed: rowCount ?? 0 };
    },

    async close() {
      await pool.end();
    },
  };
}

function createHybridStore(config) {
  const redisStore = createRedisStore(config);
  const postgresStore = createPostgresStore(config);

  return {
    async createJob(input) {
      const created = await postgresStore.createJob(input);
      await redisStore.createJob(created);
      return created;
    },
    async updateJob(id, patch) {
      const updated = await postgresStore.updateJob(id, patch);
      if (!updated) return null;
      await redisStore.updateJob(id, updated);
      return updated;
    },
    async getJob(id) {
      const cached = await redisStore.getJob(id);
      if (cached) return cached;
      const job = await postgresStore.getJob(id);
      if (job) await redisStore.createJob(job).catch(() => {});
      return job;
    },
    async appendError(id, message) {
      const updated = await postgresStore.appendError(id, message);
      if (!updated) return null;
      await redisStore.updateJob(id, updated).catch(() => {});
      return updated;
    },
    async cleanupExpiredJobs() {
      const [pgResult, redisResult] = await Promise.all([
        postgresStore.cleanupExpiredJobs(),
        redisStore.cleanupExpiredJobs(),
      ]);
      return { postgres: pgResult, redis: redisResult };
    },
    async close() {
      await Promise.all([redisStore.close(), postgresStore.close()]);
    },
  };
}

export function createJobStore(options = {}) {
  const backend = options.backend || process.env.JOB_STORE_BACKEND || 'memory';
  const completedTtlSeconds = toPositiveInt(
    options.completedTtlSeconds ?? process.env.JOB_COMPLETED_TTL_SECONDS,
    60 * 60,
  );
  const retentionDays = toPositiveInt(options.retentionDays ?? process.env.JOB_RETENTION_DAYS, 7);

  const config = {
    redisUrl: options.redisUrl || process.env.REDIS_URL,
    postgresUrl: options.postgresUrl || process.env.POSTGRES_URL,
    completedTtlSeconds,
    retentionDays,
  };

  switch (backend) {
    case 'redis':
      if (!config.redisUrl) throw new Error('REDIS_URL is required for redis job store backend');
      return createRedisStore(config);
    case 'postgres':
      if (!config.postgresUrl) throw new Error('POSTGRES_URL is required for postgres job store backend');
      return createPostgresStore(config);
    case 'hybrid':
      if (!config.redisUrl || !config.postgresUrl) {
        throw new Error('REDIS_URL and POSTGRES_URL are required for hybrid job store backend');
      }
      return createHybridStore(config);
    case 'memory':
      return createMemoryStore(config);
    default:
      throw new Error(`Unsupported JOB_STORE_BACKEND: ${backend}`);
  }
}
