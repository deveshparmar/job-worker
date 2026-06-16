import { config } from "./config/index.js";
import { consumer, producer } from "./kafka/client.js";
import { consume } from "./kafka/consumer.js";
import { consumeDeadLetters, disconnectDlqConsumer } from "./kafka/dlqConsumer.js";
import { startMetricsServer } from "./metrics/server.js";
import { getActiveJobs } from "./worker/concurrency.js";
import { startCronScheduler } from "./worker/cronScheduler.js";
import { startReconciliationPoller } from "./worker/scheduler.js";
import { startShutDown } from "./worker/shutdown.js";
import { recoverStaleJobs } from "./worker/sweeper.js";

console.log("Job worker started...");

startMetricsServer();
await producer.connect();
consume();
consumeDeadLetters();
startReconciliationPoller();
startCronScheduler();

setInterval(() => {
  recoverStaleJobs().catch((error) => {
    console.error("Stale job recovery failed:", error);
  });
}, 60000);

async function shutdown() {
  console.log("Shutdown signal received");
  startShutDown();

  console.log("Stopping Kafka consumers...");
  await consumer.disconnect();
  await disconnectDlqConsumer();

  console.log("Waiting for active jobs to finish...");
  while (getActiveJobs() > 0) {
    console.log(`Active jobs remaining: ${getActiveJobs()}`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("Worker shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
