import { config } from "../config/index.js";
import pool from "../db/client.js";
import { SQL_QUERIES } from "../helpers/queries.js";
import { publishDeadLetter } from "../kafka/dlqProducer.js";
import { jobDuration, jobsFailed, jobsProcessed, jobsRetried } from "../metrics/metrics.js";
import type { IJobInstance } from "../types/jobInstances.js";
import { calculateBackoffRetryDelay } from "./retryStrategy.js";

export async function runWorkerCycle(jobId:string) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const jobFetchQuery = SQL_QUERIES.SELECT_PENDING_JOBS;
        const result = await client.query(jobFetchQuery);
        if (result.rowCount === 0) {
            await client.query("COMMIT");
            return;
        }
        const job: IJobInstance = result.rows[0];
        const statusQuery = SQL_QUERIES.UPDATE_JOB_STATUS;
        const values = ["PROCESSING", config.WORKER_ID, job.id];
        const statusResult = await client.query(statusQuery, values);


        const jobExecutionQuery = SQL_QUERIES.ADD_JOB_EXECUTION;
        const jobExecutionValues = [job.id, job.retry_count + 1, "PROCESSING", config.WORKER_ID];
        const jobExecutionResult = await client.query(jobExecutionQuery, jobExecutionValues);
        await client.query("COMMIT");

        const executionId: string = jobExecutionResult.rows[0].id;

        try {
            await processJob(job);
            await markJobSuccess(job.id, executionId);
        } catch (error: any) {
            await markJobFailure(job, executionId, error.message);
        }
    } catch (error: any) {
        await client.query("ROLLBACK");
        throw new Error(error);
    } finally {
        client.release();
    }
}


async function processJob(job: IJobInstance) {

  console.log("Processing job:", job.id);

  await new Promise((resolve) => setTimeout(resolve, 500));

  if (Math.random() < 0.5) {
    throw new Error("Simulated failure");
  }
}

async function markJobSuccess(jobId: string, executionId: string, errorMessage?: string) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");


        const updateJobExecutionQuery = SQL_QUERIES.MARK_JOB_EXECUTION_SUCCESS;
        await client.query(updateJobExecutionQuery, [executionId]);

        
        const updateQuery = SQL_QUERIES.MARK_JOB_SUCCESS;
        await client.query(updateQuery, [jobId]);
        
        await client.query("COMMIT");

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function markJobFailure(job: IJobInstance, executionId: string, errorMessage: string) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");


        const updateJobExecutionQuery = SQL_QUERIES.MARK_JOB_EXECUTION_FAILURE;
        await client.query(updateJobExecutionQuery, [executionId, errorMessage]);

        if (job.retry_count + 1 >= job.max_retries) {
            const updateQuery = SQL_QUERIES.MARK_JOB_DEAD;
            await client.query(updateQuery, [job.id]);

            await publishDeadLetter(job.id, errorMessage);
        }
        else {
            const updateQuery = SQL_QUERIES.MARK_JOB_RETRY;
            await client.query(updateQuery, [job.id, calculateBackoffRetryDelay(job.retry_count)]);
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

export async function runWorkerCycleWithoutKafka() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const jobFetchQuery = SQL_QUERIES.SELECT_ALL_JOBS;
        const result = await client.query(jobFetchQuery);
        if (result.rowCount === 0) {
            await client.query("COMMIT");
            return;
        }
        const job: IJobInstance = result.rows[0];
        const statusQuery = SQL_QUERIES.UPDATE_JOB_STATUS;
        const values = ["PROCESSING", config.WORKER_ID, job.id];
        const statusResult = await client.query(statusQuery, values);


        const jobExecutionQuery = SQL_QUERIES.ADD_JOB_EXECUTION;
        const jobExecutionValues = [job.id, job.retry_count + 1, "PROCESSING", config.WORKER_ID];
        const jobExecutionResult = await client.query(jobExecutionQuery, jobExecutionValues);
        await client.query("COMMIT");

        const executionId: string = jobExecutionResult.rows[0].id;

        const endTimer = jobDuration.startTimer();

        try {
            await processJob(job);
            await markJobSuccess(job.id, executionId);
            jobsProcessed.inc()
        } catch (error: any) {
            await markJobFailure(job, executionId, error.message);
            jobsFailed.inc();
        } finally{
            endTimer();
        }
    } catch (error: any) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}


