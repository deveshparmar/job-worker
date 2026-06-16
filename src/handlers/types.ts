import type { IJobInstance } from "../types/jobInstances.js";

export interface JobHandlerContext {
  job: IJobInstance;
  jobType: string;
}

export type JobHandler = (context: JobHandlerContext) => Promise<void>;
