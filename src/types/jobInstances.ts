export interface IJobInstance {
   id:string,
   job_def_id:number,
   idempotency_key:string,
   status:string,
   retry_count:number,
   max_retries:number,
   payload:any,
   next_run_time:string,
   locked_at:string,
   locked_by:string,
   last_heartbeat:string,
   updated_at:string,
   created_at:string
}