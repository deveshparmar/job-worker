import type { JobHandler } from "./types.js";

export const sleepHandler: JobHandler = async ({ job }) => {
  const durationMs = Number(job.payload?.duration_ms ?? 1000);
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};
