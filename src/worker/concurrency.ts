import { config } from "../config/index.js";
import { activeJobsGauge } from "../metrics/metrics.js";

let activeJobs = 0;

export function canAcquireLock() {
    return activeJobs < Number(config.WORKER_CONCURRENCY);
}

export function incrementActiveJobs() {
    activeJobs++;
    activeJobsGauge.inc();
}

export function decrementActiveJobs() {
    activeJobs--;
    activeJobsGauge.dec();
}

export function getActiveJobs() {
    return activeJobs;
}
