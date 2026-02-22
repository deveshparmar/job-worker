import { config } from "./config/index.js";
import { runWorkerCycle } from "./worker/jobRunner.js";
import { recoverStaleJobs } from "./worker/sweeper.js";

console.log("Worker started");

setInterval(() => {
    runWorkerCycle();
}, Number(config.POLL_INTERVAL_MS));

setInterval(() => {
    recoverStaleJobs();
}, 60000);