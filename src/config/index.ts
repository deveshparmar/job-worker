import dotenv from "dotenv";
dotenv.config();

export const config = {
    PORT:process.env.PORT,
    DB_HOST:process.env.DB_HOST,
    DB_NAME:process.env.DB_NAME,
    DB_PASSWORD:process.env.DB_PASSWORD,
    DB_PORT:process.env.DB_PORT,
    DB_USER:process.env.DB_USER,
    WORKER_ID:process.env.WORKER_ID,
    POLL_INTERVAL_MS:process.env.POLL_INTERVAL_MS,
    HEARTBEAT_INTERVAL_MS:process.env.HEARTBEAT_INTERVAL_MS,
    LOCK_TIMEOUT_SECONDS:process.env.LOCK_TIMEOUT_SECONDS,
    BASE_RETRY_DELAY_SECONDS:process.env.BASE_RETRY_DELAY_SECONDS,
    DB_IDLE_TIMEOUT_MS:process.env.DB_IDLE_TIMEOUT_MS,
    DB_CONNECTION_TIMEOUT_MS:process.env.DB_CONNECTION_TIMEOUT_MS,
    DB_MAX_CONNECTIONS:process.env.DB_MAX_CONNECTIONS,
};