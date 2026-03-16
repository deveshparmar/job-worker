import { config } from "../config/index.js";
import { jobsReceived } from "../metrics/metrics.js";
import { runWorkerCycleWithoutKafka } from "../worker/jobRunner.js";
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
      jobsReceived.inc();

      console.log(
        `Kafka event received | Partition: ${partition} | Offset: ${message.offset}`
      );

      try {
        // trigger worker cycle
        await runWorkerCycleWithoutKafka();

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