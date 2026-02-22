import { config } from "../config/index.js";

export function calculateBackoffRetryDelay(attempt: number): number {
    return Number(config.BASE_RETRY_DELAY_SECONDS) * Math.pow(2, attempt - 1);
}

