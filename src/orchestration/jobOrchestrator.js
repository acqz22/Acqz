import crypto from 'crypto';
import { createJobStore, JOB_STATUSES } from '../storage/jobStore.js';

/**
 * Central job orchestration service.
 *
 * Why this design:
 * - Keeps orchestration logic separate from persistence, so backend can switch between memory/Redis/Postgres.
 * - Enforces state transitions in a single path to avoid inconsistent lifecycle updates.
 */
export class JobOrchestrator {
  constructor({ jobStore = createJobStore(), runJob, retentionIntervalMs = 5 * 60 * 1000 } = {}) {
    if (typeof runJob !== 'function') {
      throw new Error('JobOrchestrator requires a runJob function');
    }

    this.jobStore = jobStore;
    this.runJob = runJob;
    this.retentionInterval = setInterval(() => {
      this.jobStore.cleanupExpiredJobs().catch((error) => {
        console.error('[job-retention] cleanup failed:', error.message);
      });
    }, retentionIntervalMs);
    this.retentionInterval.unref();
  }

  async queueJob(payload = {}) {
    const id = crypto.randomUUID();
    const job = await this.jobStore.createJob({
      id,
      payload,
      status: JOB_STATUSES.QUEUED,
    });

    this.#startAsync(id, payload);
    return job;
  }

  async getJob(jobId) {
    return this.jobStore.getJob(jobId);
  }

  async #startAsync(jobId, payload) {
    try {
      await this.jobStore.updateJob(jobId, { status: JOB_STATUSES.RUNNING });
      const result = await this.runJob({ jobId, payload });
      await this.jobStore.updateJob(jobId, {
        status: JOB_STATUSES.COMPLETED,
        result,
      });
    } catch (error) {
      await this.jobStore.appendError(jobId, error.message);
      await this.jobStore.updateJob(jobId, {
        status: JOB_STATUSES.FAILED,
      });
    }
  }

  async shutdown() {
    clearInterval(this.retentionInterval);
    await this.jobStore.close();
  }
}

export function createJobOrchestrator(config) {
  return new JobOrchestrator(config);
}
