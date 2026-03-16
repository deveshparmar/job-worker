import { config } from "./config/index.js";
import { recoverStaleJobs } from "./worker/sweeper.js";
import { consume } from "./kafka/consumer.js";
import { startScheduler } from "./worker/scheduler.js";
import { startShutDown } from "./worker/shutdown.js";
import { getActiveJobs } from "./worker/concurrency.js";
import { consumer, producer } from "./kafka/client.js";

console.log("Kafka Worker started...");

consume();
await producer.connect();
startScheduler();

setInterval(() => {
    recoverStaleJobs();
}, 60000);


async function shutdown() {
  console.log("Shutdown signal received");

  startShutDown();

  console.log("Stopping Kafka consumer...");
  await consumer.disconnect();

  console.log("Waiting for active jobs to finish...");

  while (getActiveJobs() > 0) {
    console.log(`Active jobs remaining: ${getActiveJobs()}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log("Worker shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);