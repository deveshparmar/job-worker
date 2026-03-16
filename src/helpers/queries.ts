export const SQL_QUERIES = {
    SELECT_PENDING_JOBS: `
    SELECT * FROM job_instances WHERE status IN ('PENDING', 'RETRY') 
    AND next_run_time <= NOW() ORDER BY next_run_time 
    FOR UPDATE SKIP LOCKED LIMIT 1
    `,

    UPDATE_JOB_STATUS: `
    UPDATE job_instances SET status = $1, locked_by = $2, locked_at = NOW(), 
    last_heartbeat = NOW(), updated_at = NOW() WHERE id = $3
    `,

    ADD_JOB_EXECUTION: `
    INSERT INTO job_executions (job_instance_id, attempt_number, status, worker_id)
    VALUES ($1, $2, $3, $4) RETURNING id;
    `,

    MARK_JOB_SUCCESS: `
      UPDATE job_instances 
      SET status = 'COMPLETED', locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE id = $1
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

    MARK_JOB_FAILURE: `
      UPDATE job_instances 
      SET status = 'FAILED', locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE id = $1
    `,

    MARK_JOB_DEAD: `
      UPDATE job_instances 
      SET status = 'DEAD_LETTER', locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE id = $1
    `,

    MARK_JOB_RETRY: `
      UPDATE job_instances 
      SET status = 'RETRY', retry_count = retry_count + 1, next_run_time = NOW() + ($2 || ' seconds')::interval, locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE id = $1
    `,

    RECOVER_STALE_JOBS: `
      UPDATE job_instances 
      SET status = 'RETRY', locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE status = 'PROCESSING' AND locked_at < NOW() - ($1 || ' seconds')::interval
    `,

    SELECT_ALL_JOBS: `
    SELECT * FROM job_instances WHERE status IN ('PENDING', 'RETRY') 
    AND next_run_time <= NOW() ORDER BY next_run_time 
    FOR UPDATE SKIP LOCKED LIMIT 1
    `,
    
}