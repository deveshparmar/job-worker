import { config } from "../config/index.js";
import { processAvailableJobs } from "./jobRunner.js";
import { isShuttingDown } from "./shutdown.js";

/**
 * Fallback reconciliation poller for jobs missed by Kafka dispatch
 * (e.g. outbox publish delay or broker hiccup). Kafka remains the primary path.
 */
export function startReconciliationPoller(): void {
  const intervalMs = Number(
    config.RECONCILIATION_POLL_INTERVAL_MS ||
      config.POLL_INTERVAL_MS ||
      30000
  );

  setInterval(async () => {
    if (isShuttingDown()) {
      return;
    }

    try {
      const processed = await processAvailableJobs();
      if (processed > 0) {
        console.log(`Reconciliation poller processed ${processed} job(s)`);
      }
    } catch (error) {
      console.error("Reconciliation poller error:", error);
    }
  }, intervalMs);

  console.log(
    `Reconciliation poller started (fallback every ${intervalMs}ms; Kafka is primary dispatch)`
  );
}

/** @deprecated Use startReconciliationPoller */
export function startScheduler(): void {
  startReconciliationPoller();
}
