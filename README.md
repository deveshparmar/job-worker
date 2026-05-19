# Distributed Job Scheduler — Job API

This service is the **entry point of the Distributed Job Scheduler system**.
It is responsible for:

* Creating job definitions
* Scheduling job instances
* Publishing jobs to Kafka
* Ensuring idempotent job creation
* Applying rate limiting
* Persisting jobs into PostgreSQL

The API acts as the **producer layer** in the system.

---

# 🧠 System Overview

This project demonstrates how modern distributed job schedulers work internally.

Architecture:

Client → Job API → PostgreSQL → Kafka → Worker Nodes

---

# HLD
```mermaid
flowchart TD
    A["src/index.ts<br/>Worker Bootstrap"] --> B["Load config<br/>src/config/index.ts"]
    B --> C["Postgres Pool<br/>src/db/client.ts"]
    B --> D["Kafka Client<br/>src/kafka/client.ts"]

    A --> E["consume()<br/>src/kafka/consumer.ts"]
    A --> F["startScheduler()<br/>src/worker/scheduler.ts"]
    A --> G["recoverStaleJobs() every 60s<br/>src/worker/sweeper.ts"]
    A --> H["Shutdown handlers<br/>SIGINT / SIGTERM"]

    D --> E
    E --> I["Subscribe to Kafka topic<br/>jobs-topic / KAFKA_TOPIC"]
    I --> J["Kafka message received"]
    J --> K["jobsReceived metric++"]
    J --> L["runWorkerCycleWithoutKafka()<br/>src/worker/jobRunner.ts"]
    L --> M["Commit Kafka offset<br/>manual commit"]

    F --> N["Every 2 seconds"]
    N --> L

    L --> O["BEGIN DB transaction"]
    O --> P["SELECT runnable job<br/>PENDING / RETRY<br/>next_run_time <= NOW()<br/>FOR UPDATE SKIP LOCKED"]
    P --> Q{"Job found?"}
    Q -->|No| R["COMMIT and return"]
    Q -->|Yes| S["Mark job PROCESSING<br/>locked_by = WORKER_ID<br/>locked_at = NOW()"]
    S --> T["Insert job_executions row<br/>status = PROCESSING<br/>attempt = retry_count + 1"]
    T --> U["COMMIT lock transaction"]

    U --> V["processJob(job)<br/>Current implementation simulates work"]
    V --> W{"Execution success?"}

    W -->|Yes| X["markJobSuccess()"]
    X --> X1["BEGIN"]
    X1 --> X2["Update job_executions<br/>status = COMPLETED<br/>ended_at = NOW()"]
    X2 --> X3["Update job_instances<br/>status = COMPLETED<br/>clear lock fields"]
    X3 --> X4["COMMIT"]
    X4 --> X5["jobsProcessed metric++"]

    W -->|No| Y["markJobFailure()"]
    Y --> Y1["BEGIN"]
    Y1 --> Y2["Update job_executions<br/>status = FAILED<br/>error_message"]
    Y2 --> Z{"retry_count + 1 >= max_retries?"}

    Z -->|No| AA["Calculate exponential backoff<br/>retryStrategy.ts"]
    AA --> AB["Update job_instances<br/>status = RETRY<br/>retry_count++<br/>next_run_time = NOW() + delay"]
    AB --> AC["jobsRetried metric++"]
    AC --> AD["COMMIT"]

    Z -->|Yes| AE["Update job_instances<br/>status = DEAD_LETTER<br/>clear lock fields"]
    AE --> AF["publishDeadLetter()<br/>src/kafka/dlqProducer.ts"]
    AF --> AG["Kafka topic:<br/>jobs-dead-letter"]
    AG --> AH["COMMIT"]

    AD --> AI["jobsFailed metric++"]
    AH --> AI

    G --> AJ["BEGIN"]
    AJ --> AK["Find stale PROCESSING jobs<br/>locked_at older than LOCK_TIMEOUT_SECONDS"]
    AK --> AL["Mark stale jobs RETRY<br/>clear lock fields"]
    AL --> AM["COMMIT"]

    H --> AN["startShutDown()<br/>shutdown flag = true"]
    AN --> AO["Disconnect Kafka consumer"]
    AO --> AP["Wait until getActiveJobs() == 0"]
    AP --> AQ["process.exit(0)"]

    subgraph DB["PostgreSQL"]
        DB1["job_instances"]
        DB2["job_executions"]
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

    RETRY --> PROCESSING
    COMPLETED --> [*]
    DEAD_LETTER --> [*]
```

---

# ⚙️ Tech Stack

Node.js
TypeScript
Express.js
PostgreSQL
Kafka
Redis (Rate Limiting)
Prometheus (Metrics)
Docker

---

# 🏗 High Level Architecture

The Job API is responsible for **reliably accepting jobs and publishing them to Kafka**.

Flow:

1. Client creates job definition
2. Client schedules job instance
3. API stores job in PostgreSQL
4. API publishes job event to Kafka
5. Workers consume the job

This architecture ensures:

* Decoupled workers
* Horizontal scaling
* Reliable retry mechanisms

---

# 🚀 API Endpoints

## Create Job Definition

POST /job-definitions

Example request:

{
"name": "send_email",
"job_type": "email",
"cron_expression": null
}

---

## Schedule Job

POST /jobs

Example request:

{
"job_def_id": "UUID",
"idempotency_key": "email-user-123",
"payload": {
"email": "[user@test.com](mailto:user@test.com)"
},
"next_run_time": "2026-03-17T10:00:00Z"
}

---

## Get Job Status

GET /job/:id

Returns job state and retry information.

---

# 🔁 Idempotency Support

Jobs include an **idempotency key**.

This prevents duplicate jobs when:

* API retries happen
* client retries requests
* network failures occur

Unique constraint:

(job_def_id, idempotency_key)

---

# ⚡ Rate Limiting

Rate limiting is implemented using Redis.

This protects the API from:

* abuse
* job floods
* accidental high load

---

# 📊 Observability

Metrics are exposed for Prometheus.

Example metrics:

jobs_created_total
jobs_failed_total
api_request_duration_seconds

Metrics endpoint:

/metrics

---

# 🐳 Running Locally

Start infrastructure:

docker-compose up -d

Services started:

PostgreSQL
Kafka
Redis
Prometheus
Grafana

---

# ▶ Run API

npm install
npm run dev

Server runs on:

http://localhost:8000

---

# 🔐 Reliability Guarantees

The system guarantees:

* Idempotent job creation
* Reliable event publishing
* Safe retries
* Horizontal scaling

---

# 📌 Future Improvements

Outbox Pattern for Kafka reliability
Distributed cron scheduling
Workflow orchestration
Job priority queues

---


# 👨‍💻 Author

Built as a distributed systems project demonstrating production-grade backend architecture.
