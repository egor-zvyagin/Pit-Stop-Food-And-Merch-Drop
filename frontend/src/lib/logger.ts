/**
 * Pit Stop v3: Structured JSON Logger
 * Emits single-line JSON log entries for API observability.
 */

export interface LogEntry {
  timestamp: string;
  requestId: string;
  route: string;
  method: string;
  status: number;
  latencyMs: number;
  dbOp?: string;
  error?: string;
}

/**
 * Emit a single-line structured JSON log to stdout.
 */
export function logRequest(entry: LogEntry): void {
  // Emit as a single-line JSON string to stdout (compatible with CloudWatch Logs)
  process.stdout.write(JSON.stringify(entry) + '\n');
}

/**
 * Creates a request logger that tracks latency from construction to log().
 *
 * Usage:
 *   const logger = createRequestLogger({ requestId, route, method });
 *   // ... do work ...
 *   logger.log({ status: 200, dbOp: 'getOrderById' });
 */
export function createRequestLogger(opts: {
  requestId: string;
  route: string;
  method: string;
}) {
  const start = Date.now();

  return {
    log(fields: { status: number; dbOp?: string; error?: string }): void {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        requestId: opts.requestId,
        route: opts.route,
        method: opts.method,
        status: fields.status,
        latencyMs: Date.now() - start,
        ...(fields.dbOp !== undefined ? { dbOp: fields.dbOp } : {}),
        ...(fields.error !== undefined ? { error: fields.error } : {}),
      };
      logRequest(entry);
    },
  };
}

/**
 * Generates a short alphanumeric request ID for correlation.
 */
export function generateRequestId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
