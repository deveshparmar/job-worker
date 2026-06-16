import { defaultHandler } from "./default.js";
import { emailHandler } from "./email.js";
import { sleepHandler } from "./sleep.js";
import type { JobHandler } from "./types.js";
import { webhookHandler } from "./webhook.js";

const handlers = new Map<string, JobHandler>([
  ["email", emailHandler],
  ["webhook", webhookHandler],
  ["sleep", sleepHandler],
]);

export function getHandler(jobType: string): JobHandler {
  return handlers.get(jobType.toLowerCase()) ?? defaultHandler;
}
