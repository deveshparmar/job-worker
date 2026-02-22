import { config } from "../config/index.js";
import { Pool } from "pg";
const pool = new Pool({
    host: config.DB_HOST,
    port: Number(config.DB_PORT),
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    user: config.DB_USER,
    max: Number(config.DB_MAX_CONNECTIONS),
    idleTimeoutMillis: Number(config.DB_IDLE_TIMEOUT_MS),
    connectionTimeoutMillis: Number(config.DB_CONNECTION_TIMEOUT_MS)
});

export default pool;