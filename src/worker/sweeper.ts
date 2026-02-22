import { config } from "../config/index.js";
import pool from "../db/client.js";
import { SQL_QUERIES } from "../helpers/queries.js";

export async function recoverStaleJobs() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const query = SQL_QUERIES.RECOVER_STALE_JOBS;
        const values = [config.LOCK_TIMEOUT_SECONDS];
        const result = await client.query(query, values);
        await client.query("COMMIT");
        return result.rowCount;
    } catch (error:any) {
        await client.query("ROLLBACK");
        throw new Error(error);
    } finally {
        client.release();
    }
}