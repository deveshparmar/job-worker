export interface IJobDefination {
    id:number
    name:string,
    cron_expression:string,
    job_type:string,
    default_payload:any,
    is_active:boolean,
    created_at:string,
    updated_at:string,
    created_by:string,
    updated_by:string
}