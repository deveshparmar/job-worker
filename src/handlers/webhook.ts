import type { JobHandler } from "./types.js";

export const webhookHandler: JobHandler = async ({ job }) => {
  const url = job.payload?.url;

  if (!url || typeof url !== "string") {
    throw new Error("webhook handler requires payload.url");
  }

  console.log(`[webhook] POST ${url} for job ${job.id}`, job.payload?.body ?? {});
  await new Promise((resolve) => setTimeout(resolve, 150));
};
