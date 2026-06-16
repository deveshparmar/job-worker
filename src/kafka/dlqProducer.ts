import { config } from "../config/index.js";
import { producer } from "./client.js";

export async function publishDeadLetter(jobId: string, errorMessage: string) {
  const topic = config.KAFKA_DLQ_TOPIC || "jobs-dead-letter";

  await producer.send({
    topic,
    messages: [
      {
        key: jobId,
        value: JSON.stringify({
          jobId,
          errorMessage,
          failedAt: new Date().toISOString(),
        }),
      },
    ],
  });
}
