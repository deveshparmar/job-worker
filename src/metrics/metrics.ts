import client from "prom-client";

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const jobsReceived = new client.Counter({
  name: "jobs_received_total",
  help: "Total number of jobs received",
});

export const jobsProcessed = new client.Counter({
  name: "jobs_processed_total",
  help: "Total number of successfully processed jobs",
});

export const jobsFailed = new client.Counter({
  name: "jobs_failed_total",
  help: "Total number of failed jobs",
});

export const jobsRetried = new client.Counter({
  name: "jobs_retried_total",
  help: "Total number of retried jobs",
});

export const jobDuration = new client.Histogram({
  name: "job_processing_duration_seconds",
  help: "Job processing duration",
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const activeJobsGauge = new client.Gauge({
  name: "worker_active_jobs",
  help: "Current active jobs running",
});

register.registerMetric(jobsReceived);
register.registerMetric(jobsProcessed);
register.registerMetric(jobsFailed);
register.registerMetric(jobsRetried);
register.registerMetric(jobDuration);
register.registerMetric(activeJobsGauge);