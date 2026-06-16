import { config } from "../config/index.js";
import pool from "../db/client.js";
import { getHandler } from "../handlers/index.js";
import { SQL_QUERIES } from "../helpers/queries.js";
import { publishDeadLetter } from "../kafka/dlqProducer.js";
import {
  jobDuration,
  jobsFailed,
  jobsProcessed,
  jobsRetried,
} from "../metrics/metrics.js";
import type { IJobInstance } from "../types/jobInstances.js";
import {
  canAcquireLock,
  decrementActiveJobs,
  incrementActiveJobs,
} from "./concurrency.js";
import { recordDeadLetter } from "./deadLetter.js";
import { startJobHeartbeat } from "./heartbeat.js";
import { calculateBackoffRetryDelay } from "./retryStrategy.js";
import { isShuttingDown } from "./shutdown.js";
import { withTimeout } from "./timeout.js";

interface ClaimedJob extends IJobInstance {
  job_type: string;
  timeout_seconds?: number;
}

interface ClaimResult {
  job: ClaimedJob;
  executionId: string;
}

async function claimNextJob(): Promise<ClaimResult | null> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(SQL_QUERIES.SELECT_PENDING_JOBS);
    if (result.rowCount === 0) {
      await client.query("COMMIT");
      return null;
    }

    const job = result.rows[0] as ClaimedJob;
    const statusResult = await client.query(SQL_QUERIES.UPDATE_JOB_STATUS, [
      "PROCESSING",
      config.WORKER_ID,
      job.id,
    ]);

    if (statusResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const executionResult = await client.query(SQL_QUERIES.ADD_JOB_EXECUTION, [
      job.id,
      job.retry_count + 1,
      "PROCESSING",
      config.WORKER_ID,
    ]);

    await client.query("COMMIT");

    return {
      job,
      executionId: executionResult.rows[0].id as string,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function executeJob(claimed: ClaimResult): Promise<void> {
  const { job, executionId } = claimed;
  const endTimer = jobDuration.startTimer();
  const stopHeartbeat = startJobHeartbeat(job.id);
  const timeoutMs =
    Number(job.timeout_seconds || config.DEFAULT_JOB_TIMEOUT_SECONDS || 60) *
    1000;

  try {
    const handler = getHandler(job.job_type);
    await withTimeout(
      handler({ job, jobType: job.job_type }),
      timeoutMs,
      job.id
    );
    await markJobSuccess(job.id, executionId);
    jobsProcessed.inc();
  } catch (error: any) {
    await markJobFailure(job, executionId, error.message);
    jobsFailed.inc();
  } finally {
    stopHeartbeat();
    endTimer();
  }
}

async function markJobSuccess(jobId: string, executionId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(SQL_QUERIES.MARK_JOB_EXECUTION_SUCCESS, [executionId]);
    await client.query(SQL_QUERIES.MARK_JOB_SUCCESS, [jobId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function markJobFailure(
  job: ClaimedJob,
  executionId: string,
  errorMessage: string
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(SQL_QUERIES.MARK_JOB_EXECUTION_FAILURE, [
      executionId,
      errorMessage,
    ]);

    if (job.retry_count + 1 >= job.max_retries) {
      await client.query(SQL_QUERIES.MARK_JOB_DEAD, [job.id]);
      await recordDeadLetter(job.id, errorMessage, "execution", {
        worker_id: config.WORKER_ID,
      });
      await publishDeadLetter(job.id, errorMessage);
    } else {
      await client.query(SQL_QUERIES.MARK_JOB_RETRY, [
        job.id,
        calculateBackoffRetryDelay(job.retry_count),
      ]);
      jobsRetried.inc();
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processAvailableJobs(): Promise<number> {
  let processed = 0;

  while (canAcquireLock() && !isShuttingDown()) {
    const claimed = await claimNextJob();
    if (!claimed) {
      break;
    }

    incrementActiveJobs();
    try {
      await executeJob(claimed);
      processed++;
    } finally {
      decrementActiveJobs();
    }
  }

  return processed;
}

/** @deprecated Use processAvailableJobs */
export async function runWorkerCycleWithoutKafka(): Promise<number> {
  return processAvailableJobs();
}
