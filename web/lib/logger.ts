type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  sessionId?: string;
  callerId?: string;
  tool?: string;
  agent?: string;
  durationMs?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug");

function emit(entry: LogEntry) {
  const json = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(json);
  } else if (entry.level === "warn") {
    console.warn(json);
  } else {
    console.log(json);
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function log(level: LogLevel, message: string, context?: LogContext) {
  if (!shouldLog(level)) return;
  emit({
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context && Object.keys(context).length > 0 ? context : undefined,
  });
}

export function createLogger(defaultContext: LogContext = {}) {
  return {
    debug: (msg: string, ctx?: LogContext) =>
      log("debug", msg, { ...defaultContext, ...ctx }),
    info: (msg: string, ctx?: LogContext) =>
      log("info", msg, { ...defaultContext, ...ctx }),
    warn: (msg: string, ctx?: LogContext) =>
      log("warn", msg, { ...defaultContext, ...ctx }),
    error: (msg: string, ctx?: LogContext) =>
      log("error", msg, { ...defaultContext, ...ctx }),
    child: (childContext: LogContext) =>
      createLogger({ ...defaultContext, ...childContext }),
    /** Measure and log the duration of an async operation */
    async time<T>(label: string, fn: () => Promise<T>, ctx?: LogContext): Promise<T> {
      const start = performance.now();
      try {
        const result = await fn();
        const durationMs = Math.round(performance.now() - start);
        log("info", `${label} completed`, { ...defaultContext, ...ctx, durationMs });
        return result;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        log("error", `${label} failed`, {
          ...defaultContext,
          ...ctx,
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
