# Distributed Job Scheduler — Job Worker

This service is the **execution layer** of the Distributed Job Scheduler system. It is responsible for:

* Consuming job-dispatch events from Kafka
* Claiming runnable jobs from PostgreSQL (`PENDING` / `RETRY`)
* Executing jobs via pluggable handlers (`email`, `webhook`, `sleep`, and a default fallback)
* Retrying failed jobs with exponential backoff
* Publishing and persisting dead-letter records
* Recovering stale locks from crashed workers
* Running leader-elected cron scheduling for recurring job definitions
* Exposing Prometheus metrics and a health endpoint

The worker acts as the **consumer/processor layer** in the system.

---

# System Overview

This project demonstrates how distributed job schedulers execute work reliably at scale.

Architecture:

```
Client → Job API → PostgreSQL + Kafka → Worker Node(s) → Handlers / DLQ
```

Multiple worker instances can run in parallel. Job claiming uses `FOR UPDATE SKIP LOCKED` so workers do not double-process the same job.

---

# HLD

```mermaid
flowchart TD
    A["src/index.ts<br/>Worker Bootstrap"] --> B["Load config<br/>src/config/index.ts"]
    B --> C["Postgres Pool<br/>src/db/client.ts"]
    B --> D["Kafka Client<br/>src/kafka/client.ts"]

    A --> MS["startMetricsServer()<br/>src/metrics/server.ts"]
  MS --> MS1["/metrics and /health"]

    A --> E["consume()<br/>src/kafka/consumer.ts"]
    A --> F["startReconciliationPoller()<br/>src/worker/scheduler.ts"]
    A --> CR["startCronScheduler()<br/>src/worker/cronScheduler.ts"]
    A --> G["recoverStaleJobs() every 60s<br/>src/worker/sweeper.ts"]
    A --> DLQ["consumeDeadLetters()<br/>src/kafka/dlqConsumer.ts"]
    A --> H["Shutdown handlers<br/>SIGINT / SIGTERM"]

    D --> E
    E --> I["Subscribe to Kafka topic<br/>jobs-topic / KAFKA_TOPIC"]
    I --> J["Kafka message received"]
    J --> K["jobs_received_total++"]
    J --> L["processAvailableJobs()<br/>src/worker/jobRunner.ts"]
    L --> M["Commit Kafka offset<br/>manual commit"]

    F --> N["Every RECONCILIATION_POLL_INTERVAL_MS<br/>fallback when Kafka dispatch is missed"]
    N --> L

    CR --> CR1["withLeaderLock()<br/>src/leader/lock.ts<br/>PostgreSQL advisory lock"]
    CR1 --> CR2["Enqueue due cron job_instances<br/>+ outbox_events row"]
    CR2 --> CR3["Kafka dispatch via outbox relay (Job API)"]

    L --> O["BEGIN DB transaction"]
    O --> P["SELECT runnable job<br/>PENDING / RETRY<br/>next_run_time <= NOW()<br/>FOR UPDATE SKIP LOCKED"]
    P --> Q{"Job found?"}
    Q -->|No| R["COMMIT and return"]
    Q -->|Yes| S["Mark job PROCESSING<br/>locked_by = WORKER_ID<br/>locked_at = NOW()"]
    S --> T["Insert job_executions row<br/>status = PROCESSING<br/>attempt = retry_count + 1"]
    T --> U["COMMIT lock transaction"]

    U --> V["getHandler(job_type)<br/>src/handlers/*"]
    V --> V1["startJobHeartbeat()<br/>src/worker/heartbeat.ts"]
    V1 --> V2["withTimeout()<br/>src/worker/timeout.ts"]
    V2 --> W{"Execution success?"}

    W -->|Yes| X["markJobSuccess()"]
    X --> X1["BEGIN"]
    X1 --> X2["Update job_executions<br/>status = COMPLETED<br/>ended_at = NOW()"]
    X2 --> X3["Update job_instances<br/>status = COMPLETED<br/>clear lock fields"]
    X3 --> X4["COMMIT"]
    X4 --> X5["jobs_processed_total++"]

    W -->|No| Y["markJobFailure()"]
    Y --> Y1["BEGIN"]
    Y1 --> Y2["Update job_executions<br/>status = FAILED<br/>error_message"]
    Y2 --> Z{"retry_count + 1 >= max_retries?"}

    Z -->|No| AA["Calculate exponential backoff<br/>retryStrategy.ts"]
    AA --> AB["Update job_instances<br/>status = RETRY<br/>retry_count++<br/>next_run_time = NOW() + delay"]
    AB --> AC["jobs_retried_total++"]
    AC --> AD["COMMIT"]

    Z -->|Yes| AE["Update job_instances<br/>status = DEAD_LETTER<br/>clear lock fields"]
    AE --> AF1["recordDeadLetter()<br/>dead_letter_records table"]
    AF1 --> AF["publishDeadLetter()<br/>src/kafka/dlqProducer.ts"]
    AF --> AG["Kafka topic:<br/>jobs-dead-letter"]
    AG --> AH["COMMIT"]

    AD --> AI["jobs_failed_total++"]
    AH --> AI

    DLQ --> DLQ1["Persist DLQ Kafka events<br/>into dead_letter_records"]

    G --> AJ["BEGIN"]
    AJ --> AK["Find stale PROCESSING jobs<br/>last_heartbeat / locked_at older than LOCK_TIMEOUT_SECONDS"]
    AK --> AL{"Retries exhausted?"}
    AL -->|No| AM["Mark stale job RETRY<br/>clear lock fields"]
    AL -->|Yes| AN["Mark DEAD_LETTER<br/>record + publish DLQ"]
    AM --> AO["COMMIT"]
    AN --> AO

    H --> AP["startShutDown()<br/>shutdown flag = true"]
    AP --> AQ["Disconnect Kafka consumers"]
    AQ --> AR["Wait until getActiveJobs() == 0"]
    AR --> AS["process.exit(0)"]

    subgraph DB["PostgreSQL"]
        DB1["job_instances"]
        DB2["job_executions"]
        DB3["job_definitions"]
        DB4["dead_letter_records"]
        DB5["outbox_events"]
    end

    P -. reads/locks .-> DB1
    S -. updates .-> DB1
    T -. inserts .-> DB2
    X2 -. updates .-> DB2
    X3 -. updates .-> DB1
    Y2 -. updates .-> DB2
    AB -. updates .-> DB1
    AE -. updates .-> DB1
    AK -. updates .-> DB1
    AF1 -. inserts .-> DB4
    CR2 -. inserts .-> DB1
    CR2 -. inserts .-> DB5

    subgraph Metrics["Prometheus Metrics<br/>src/metrics/metrics.ts"]
        MT1["jobs_received_total"]
        MT2["jobs_processed_total"]
        MT3["jobs_failed_total"]
        MT4["jobs_retried_total"]
        MT5["job_processing_duration_seconds"]
        MT6["worker_active_jobs"]
    end

    K -.-> MT1
    X5 -.-> MT2
    AI -.-> MT3
    AC -.-> MT4
    L -. timer .-> MT5
```

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> PROCESSING: worker locks job
    RETRY --> PROCESSING: next_run_time reached

    PROCESSING --> COMPLETED: job succeeds
    PROCESSING --> RETRY: job fails and retries remain
    PROCESSING --> DEAD_LETTER: max retries reached
    PROCESSING --> RETRY: stale lock recovered by sweeper
    PROCESSING --> DEAD_LETTER: stale lock and retries exhausted

    RETRY --> PROCESSING
    COMPLETED --> [*]
    DEAD_LETTER --> [*]
```

---

# Tech Stack

* Node.js
* TypeScript
* PostgreSQL
* Kafka (KafkaJS)
* Prometheus (`prom-client`)
* Docker (Kafka, Prometheus, Grafana)

---

# High Level Architecture

The worker coordinates three dispatch paths:

1. **Kafka consumer (primary)** — each message triggers `processAvailableJobs()` to claim and run work.
2. **Reconciliation poller (fallback)** — periodically polls the database for runnable jobs missed by Kafka (for example, outbox relay delay or broker hiccup).
3. **Cron scheduler (leader-elected)** — one worker acquires a PostgreSQL advisory lock and enqueues due cron job instances plus outbox events.

Execution flow:

1. Job API stores a job instance in PostgreSQL and publishes a dispatch event to Kafka.
2. A worker receives the Kafka event and claims the next runnable job.
3. The worker runs the matching handler under a timeout with periodic heartbeats.
4. On success, the job is marked `COMPLETED`. On failure, it is retried with backoff or moved to `DEAD_LETTER`.
5. A sweeper recovers jobs left in `PROCESSING` after worker crashes.

This architecture ensures:

* Decoupled, horizontally scalable workers
* At-least-once dispatch with database reconciliation
* Safe retries, heartbeats, and stale-lock recovery
* Observable execution via Prometheus

---

# Job Handlers

Handlers live in `src/handlers/` and are selected by `job_type` from `job_definitions`.

| `job_type` | Handler | Required payload |
|------------|---------|------------------|
| `email` | `emailHandler` | `{ "email": "user@example.com" }` |
| `webhook` | `webhookHandler` | `{ "url": "https://...", "body": {} }` |
| `sleep` | `sleepHandler` | `{ "duration_ms": 1000 }` (optional, default 1000) |
| anything else | `defaultHandler` | any JSON payload |

Per-job timeout comes from `job_definitions.timeout_seconds`, falling back to `DEFAULT_JOB_TIMEOUT_SECONDS` (default 60).

---

# Concurrency and Reliability

* **Worker concurrency** — `WORKER_CONCURRENCY` caps how many jobs a single process runs at once (default 5).
* **Heartbeats** — while a job runs, `last_heartbeat` is updated on a fixed interval so the sweeper can distinguish live work from crashed workers.
* **Timeouts** — handlers are wrapped in `withTimeout()`; exceeded jobs fail and enter the retry/DLQ path.
* **Stale recovery** — every 60 seconds, jobs in `PROCESSING` with an expired heartbeat/lock are moved to `RETRY` or `DEAD_LETTER`.
* **Graceful shutdown** — on `SIGINT`/`SIGTERM`, the worker stops accepting new Kafka work and waits for in-flight jobs to finish.
* **Dead letters** — terminal failures are written to `dead_letter_records` and published to the DLQ Kafka topic; a dedicated DLQ consumer persists inbound DLQ events as well.

---

# Cron Scheduling

The cron scheduler (`src/worker/cronScheduler.ts`):

* Runs on a configurable tick interval (`CRON_TICK_INTERVAL_MS`, default 60s).
* Uses `withLeaderLock()` so only one worker enqueues cron jobs at a time.
* Reads active `job_definitions` with a `cron_expression`.
* Creates idempotent `job_instances` keyed by `cron-{jobDefId}-{minute-bucket}`.
* Inserts an `outbox_events` row so the Job API relay can publish to Kafka.

---

# Observability

Metrics are exposed on a dedicated HTTP server (not the Job API).

| Endpoint | Purpose |
|----------|---------|
| `GET /metrics` | Prometheus scrape target |
| `GET /health` | Liveness check (`{ "status": "ok" }`) |

Metrics:

* `jobs_received_total`
* `jobs_processed_total`
* `jobs_failed_total`
* `jobs_retried_total`
* `job_processing_duration_seconds`
* `worker_active_jobs`
* Default Node.js process metrics via `prom-client`

Default metrics port: `4000` (`METRICS_PORT`).

---

# Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `WORKER_ID` | Unique identifier stored in `locked_by` / `worker_id` |
| `KAFKA_BROKER` | Kafka broker address |
| `KAFKA_TOPIC` | Dispatch topic (default `jobs-topic`) |
| `KAFKA_GROUP_ID` | Consumer group (default `job-workers`) |
| `KAFKA_DLQ_TOPIC` | Dead-letter topic (default `jobs-dead-letter`) |
| `WORKER_CONCURRENCY` | Max concurrent jobs per process (default `5`) |
| `POLL_INTERVAL_MS` | Legacy poll interval fallback |
| `RECONCILIATION_POLL_INTERVAL_MS` | Fallback DB poll interval (default `30000`) |
| `CRON_TICK_INTERVAL_MS` | Cron scheduler tick (default `60000`) |
| `HEARTBEAT_INTERVAL_MS` | Job heartbeat interval (default `5000`) |
| `LOCK_TIMEOUT_SECONDS` | Stale lock threshold for sweeper |
| `BASE_RETRY_DELAY_SECONDS` | Base delay for exponential backoff |
| `DEFAULT_JOB_TIMEOUT_SECONDS` | Handler timeout fallback (default `60`) |
| `LEADER_LOCK_KEY` | PostgreSQL advisory lock key for cron leader election |
| `METRICS_PORT` | Metrics/health server port (default `4000`) |
| `DB_MAX_CONNECTIONS`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS` | Pool tuning |

---

# Running Locally

## Start infrastructure

```bash
docker-compose up -d
```

Services started by this compose file:

* Zookeeper
* Kafka
* Prometheus
* Grafana

PostgreSQL is expected to be available separately (typically from the parent Job API / shared stack).

## Run the worker

```bash
npm install
npm run dev
```

The worker process starts Kafka consumers, the reconciliation poller, cron scheduler, sweeper, and metrics server.

Metrics and health:

* `http://localhost:4000/metrics`
* `http://localhost:4000/health`

Prometheus UI: `http://localhost:9090`  
Grafana UI: `http://localhost:3000`

---

# Reliability Guarantees

The worker provides:

* Safe concurrent claiming via row-level locks
* At-least-once execution with idempotent cron enqueue keys
* Exponential backoff retries
* Crash recovery through heartbeats and the sweeper
* Dead-letter persistence and Kafka notification
* Graceful shutdown without abandoning in-flight work

---

# Future Improvements

* Workflow orchestration and job dependencies
* Job priority queues
* Handler sandboxing / external worker plugins
* Smarter reconciliation backoff instead of fixed polling

---

# Author

Built as a distributed systems project demonstrating production-grade backend architecture.
