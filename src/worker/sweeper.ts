import { config } from "../config/index.js";
import pool from "../db/client.js";
import { publishDeadLetter } from "../kafka/dlqProducer.js";
import { SQL_QUERIES } from "../helpers/queries.js";
import { recordDeadLetter } from "./deadLetter.js";

export async function recoverStaleJobs(): Promise<number> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const stale = await client.query(SQL_QUERIES.SELECT_STALE_JOBS, [
      config.LOCK_TIMEOUT_SECONDS,
    ]);

    for (const row of stale.rows) {
      const exhausted = row.retry_count + 1 >= row.max_retries;

      if (exhausted) {
        await client.query(SQL_QUERIES.MARK_STALE_JOB_DEAD, [row.id]);

        const errorMessage =
          "Job exceeded max retries after stale worker recovery";

        await recordDeadLetter(row.id, errorMessage, "sweeper", {
          retry_count: row.retry_count,
          max_retries: row.max_retries,
        });

        await publishDeadLetter(row.id, errorMessage);
      } else {
        await client.query(SQL_QUERIES.MARK_STALE_JOB_RETRY, [row.id]);
      }
    }

    await client.query("COMMIT");
    return stale.rowCount ?? 0;
  } catch (error: any) {
    await client.query("ROLLBACK");
    throw new Error(error);
  } finally {
    client.release();
  }
}
