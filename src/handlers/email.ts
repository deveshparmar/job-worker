import type { JobHandler } from "./types.js";

export const emailHandler: JobHandler = async ({ job }) => {
  const email = job.payload?.email;

  if (!email || typeof email !== "string") {
    throw new Error("email handler requires payload.email");
  }

  console.log(`[email] sent notification to ${email} for job ${job.id}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
};
