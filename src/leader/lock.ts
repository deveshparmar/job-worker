import type { PoolClient } from "pg";
import pool from "../db/client.js";
import { config } from "../config/index.js";

const LEADER_LOCK_KEY = Number(config.LEADER_LOCK_KEY || 98427321);

export async function withLeaderLock(
  fn: (client: PoolClient) => Promise<void>
): Promise<boolean> {
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [LEADER_LOCK_KEY]
    );

    if (!result.rows[0]?.acquired) {
      return false;
    }

    await fn(client);
    return true;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LEADER_LOCK_KEY]);
    client.release();
  }
}
