export const SQL_QUERIES = {
    SELECT_PENDING_JOBS: `
    SELECT ji.*, jd.job_type, jd.timeout_seconds
    FROM job_instances ji
    INNER JOIN job_definitions jd ON jd.id = ji.job_def_id
    WHERE ji.status IN ('PENDING', 'RETRY')
      AND ji.next_run_time <= NOW()
    ORDER BY ji.next_run_time
    FOR UPDATE OF ji SKIP LOCKED
    LIMIT 1
    `,

    UPDATE_JOB_STATUS: `
    UPDATE job_instances
    SET status = $1,
        locked_by = $2,
        locked_at = NOW(),
        last_heartbeat = NOW(),
        updated_at = NOW()
    WHERE id = $3
      AND status IN ('PENDING', 'RETRY')
    RETURNING *
    `,

    UPDATE_HEARTBEAT: `
    UPDATE job_instances
    SET last_heartbeat = NOW(), updated_at = NOW()
    WHERE id = $1 AND status = 'PROCESSING'
    `,

    ADD_JOB_EXECUTION: `
    INSERT INTO job_executions (job_instance_id, attempt_number, status, worker_id)
    VALUES ($1, $2, $3, $4) RETURNING id;
    `,

    MARK_JOB_SUCCESS: `
      UPDATE job_instances
      SET status = 'COMPLETED', locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'PROCESSING'
    `,

    MARK_JOB_EXECUTION_SUCCESS: `
      UPDATE job_executions
      SET status = 'COMPLETED', ended_at = NOW()
      WHERE id = $1
    `,

    MARK_JOB_EXECUTION_FAILURE: `
      UPDATE job_executions
      SET status = 'FAILED', ended_at = NOW(), error_message = $2
      WHERE id = $1
    `,

    MARK_JOB_DEAD: `
      UPDATE job_instances
      SET status = 'DEAD_LETTER', locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'PROCESSING'
    `,

    MARK_JOB_RETRY: `
      UPDATE job_instances
      SET status = 'RETRY',
          retry_count = retry_count + 1,
          next_run_time = NOW() + ($2 || ' seconds')::interval,
          locked_by = NULL,
          locked_at = NULL,
          updated_at = NOW()
      WHERE id = $1 AND status = 'PROCESSING'
    `,

    SELECT_STALE_JOBS: `
      SELECT id, retry_count, max_retries
      FROM job_instances
      WHERE status = 'PROCESSING'
        AND COALESCE(last_heartbeat, locked_at) < NOW() - ($1 || ' seconds')::interval
      FOR UPDATE SKIP LOCKED
    `,

    MARK_STALE_JOB_RETRY: `
      UPDATE job_instances
      SET status = 'RETRY',
          retry_count = retry_count + 1,
          locked_by = NULL,
          locked_at = NULL,
          updated_at = NOW()
      WHERE id = $1 AND status = 'PROCESSING'
    `,

    MARK_STALE_JOB_DEAD: `
      UPDATE job_instances
      SET status = 'DEAD_LETTER',
          locked_by = NULL,
          locked_at = NULL,
          updated_at = NOW()
      WHERE id = $1 AND status = 'PROCESSING'
    `,

    INSERT_DEAD_LETTER_RECORD: `
      INSERT INTO dead_letter_records (job_instance_id, error_message, source, payload)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (job_instance_id) DO NOTHING
    `,

    GET_ACTIVE_CRON_DEFINITIONS: `
      SELECT id, cron_expression, job_type, default_payload, max_retries
      FROM job_definitions
      WHERE is_active = TRUE
        AND cron_expression IS NOT NULL
        AND cron_expression <> ''
    `,

    INSERT_CRON_JOB_INSTANCE: `
      INSERT INTO job_instances (
        job_def_id,
        idempotency_key,
        status,
        retry_count,
        max_retries,
        payload,
        next_run_time
      )
      VALUES ($1, $2, 'PENDING', 0, $3, $4, NOW())
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `,

    INSERT_OUTBOX_EVENT: `
      INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status, created_at)
      VALUES ($1, $2, $3, $4, 'PENDING', NOW())
    `,
};
