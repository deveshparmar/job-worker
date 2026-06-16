import pool from "../db/client.js";
import { SQL_QUERIES } from "../helpers/queries.js";
import { config } from "../config/index.js";

export function startJobHeartbeat(jobId: string): () => void {
  const intervalMs = Number(config.HEARTBEAT_INTERVAL_MS || 5000);

  const timer = setInterval(async () => {
    try {
      await pool.query(SQL_QUERIES.UPDATE_HEARTBEAT, [jobId]);
    } catch (error) {
      console.error(`Heartbeat failed for job ${jobId}:`, error);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
