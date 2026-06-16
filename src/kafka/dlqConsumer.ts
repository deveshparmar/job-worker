import { config } from "../config/index.js";
import { recordDeadLetter } from "../worker/deadLetter.js";
import { kafka } from "./client.js";

const dlqConsumer = kafka.consumer({
  groupId: `${config.KAFKA_GROUP_ID || "job-workers"}-dlq`,
  allowAutoTopicCreation: true,
});

export async function consumeDeadLetters(): Promise<void> {
  const topic = config.KAFKA_DLQ_TOPIC || "jobs-dead-letter";

  await dlqConsumer.connect();
  await dlqConsumer.subscribe({ topic, fromBeginning: false });

  await dlqConsumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString();
      if (!raw) {
        return;
      }

      try {
        const event = JSON.parse(raw) as {
          jobId: string;
          errorMessage?: string;
          failedAt?: string;
        };

        await recordDeadLetter(
          event.jobId,
          event.errorMessage ?? "Unknown DLQ error",
          "dlq_kafka",
          event
        );

        console.log(`DLQ record persisted for job ${event.jobId}`);
      } catch (error) {
        console.error("Failed to process DLQ message:", error);
      }
    },
  });

  console.log(`DLQ consumer subscribed to ${topic}`);
}

export async function disconnectDlqConsumer(): Promise<void> {
  await dlqConsumer.disconnect();
}
