export interface IJobExecution {
    job_instance_id:number,
    attempt_number:number,
    status:string,
    worker_id:string,
    started_at:string,
    ended_at:string,
    error_message:string,
    execution_time_ms:number,
    created_at:string
}