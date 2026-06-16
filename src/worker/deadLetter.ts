import pool from "../db/client.js";
import { SQL_QUERIES } from "../helpers/queries.js";

export async function recordDeadLetter(
  jobInstanceId: string,
  errorMessage: string,
  source: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await pool.query(SQL_QUERIES.INSERT_DEAD_LETTER_RECORD, [
    jobInstanceId,
    errorMessage,
    source,
    payload,
  ]);
}
