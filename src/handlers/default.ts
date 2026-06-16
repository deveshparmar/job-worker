import type { JobHandler } from "./types.js";

export const defaultHandler: JobHandler = async ({ job }) => {
  console.log(`[default] processed job ${job.id}`, job.payload);
  await new Promise((resolve) => setTimeout(resolve, 50));
};
