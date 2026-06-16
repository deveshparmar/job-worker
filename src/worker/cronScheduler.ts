import { CronExpressionParser } from "cron-parser";
import type { PoolClient } from "pg";
import { config } from "../config/index.js";
import { SQL_QUERIES } from "../helpers/queries.js";
import { withLeaderLock } from "../leader/lock.js";

interface CronJobDefinition {
  id: string;
  cron_expression: string;
  job_type: string;
  default_payload: Record<string, unknown>;
  max_retries?: number;
}

function isCronDue(cronExpression: string, now = new Date()): boolean {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: now,
    });
    const previousRun = interval.prev().toDate();
    const minuteStart = new Date(now);
    minuteStart.setSeconds(0, 0);

    return previousRun >= minuteStart;
  } catch {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return false;
  }
}

function buildCronIdempotencyKey(jobDefId: string, now = new Date()): string {
  const bucket = now.toISOString().slice(0, 16);
  return `cron-${jobDefId}-${bucket}`;
}

async function enqueueCronJob(
  definition: CronJobDefinition,
  client: PoolClient
): Promise<void> {
  const idempotencyKey = buildCronIdempotencyKey(definition.id);
  const payload = definition.default_payload ?? {};

  const inserted = await client.query(SQL_QUERIES.INSERT_CRON_JOB_INSTANCE, [
    definition.id,
    idempotencyKey,
    definition.max_retries ?? 3,
    payload,
  ]);

  if (inserted.rowCount === 0) {
    return;
  }

  const jobId = inserted.rows[0].id as string;

  await client.query(SQL_QUERIES.INSERT_OUTBOX_EVENT, [
    "JOB_INSTANCE",
    jobId,
    "JOB_CREATED",
    { event: "JOB_CREATED", jobId },
  ]);

  console.log(
    `Cron enqueued job ${jobId} for definition ${definition.id} (${definition.job_type})`
  );
}

async function runCronTick(client: PoolClient): Promise<void> {
  const definitions = await client.query(SQL_QUERIES.GET_ACTIVE_CRON_DEFINITIONS);

  for (const row of definitions.rows as CronJobDefinition[]) {
    if (!row.cron_expression || !isCronDue(row.cron_expression)) {
      continue;
    }

    await client.query("BEGIN");

    try {
      await enqueueCronJob(row, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`Cron enqueue failed for definition ${row.id}:`, error);
    }
  }
}

export function startCronScheduler(): void {
  const intervalMs = Number(config.CRON_TICK_INTERVAL_MS || 60000);

  setInterval(async () => {
    try {
      await withLeaderLock(async (client) => {
        await runCronTick(client);
      });
    } catch (error) {
      console.error("Cron scheduler error:", error);
    }
  }, intervalMs);

  console.log(`Cron scheduler started (tick every ${intervalMs}ms, leader-elected)`);
}
