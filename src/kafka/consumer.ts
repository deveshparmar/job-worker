import { config } from "../config/index.js";
import { jobsReceived } from "../metrics/metrics.js";
import { processAvailableJobs } from "../worker/jobRunner.js";
import { isShuttingDown } from "../worker/shutdown.js";
import { consumer } from "./client.js";

export async function consume() {
  await consumer.connect();

  await consumer.subscribe({
    topic: config.KAFKA_TOPIC || "jobs-topic",
    fromBeginning: false,
  });

  await consumer.run({
    autoCommit: false,

    eachMessage: async ({ topic, partition, message }) => {
      if (isShuttingDown()) {
        return;
      }

      jobsReceived.inc();

      console.log(
        `Kafka event received | Partition: ${partition} | Offset: ${message.offset}`
      );

      try {
        await processAvailableJobs();

        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (Number(message.offset) + 1).toString(),
          },
        ]);
      } catch (error) {
        console.error("Worker cycle failed:", error);
      }
    },
  });
}
