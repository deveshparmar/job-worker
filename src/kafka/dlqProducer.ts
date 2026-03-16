import { producer } from "./client.js";

export async function publishDeadLetter(jobId:string, errorMessage:string) {
    await producer.send({
        topic: "jobs-dead-letter",
        messages: [
            {
                key: jobId,
                value: JSON.stringify({ jobId, errorMessage, failedAt: new Date().toISOString() }),
            },
        ],
    });
    
}