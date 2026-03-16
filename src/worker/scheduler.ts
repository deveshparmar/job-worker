import pool from "../db/client.js";
import { runWorkerCycleWithoutKafka } from "./jobRunner.js";
import { isShuttingDown } from "./shutdown.js";

async function fetchNextRunnableJob() {
    const client = await pool.connect();

    try {
        const result = await client.query(`
            SELECT id
            FROM job_instances
            WHERE status IN ('PENDING','RETRY')
            AND next_run_time <= NOW()
            ORDER BY next_run_time
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        `);

        if (result.rowCount === 0) return null;

        return result.rows[0];

    } finally {
        client.release();
    }
}


export function startScheduler() {

  setInterval(async () => {

    try {
      await runWorkerCycleWithoutKafka();

    } catch (error) {

      console.error("Scheduler error:", error);

    }

  }, 2000);
}