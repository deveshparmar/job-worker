let shutDown = false;

export function isShuttingDown() {
    return shutDown;
}

export function startShutDown() {
    shutDown = true;
}