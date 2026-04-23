// Structured logger with correlation IDs for Edge Functions.
// Every log line is a single JSON object — easy to query in Supabase
// analytics (`select event_message ...`). All scopes share the same shape
// so a single correlation id can be followed across functions.
//
// Usage:
//   const log = createLogger({ scope: "send-email", correlationId });
//   log.info("dispatching", { template, to_count });
//   log.error("smtp_failed", { provider_status, error: msg });

type Level = "debug" | "info" | "warn" | "error";

export interface LoggerContext {
  scope: string;
  correlationId: string;
  // Free-form base fields merged into every line (e.g. template, event).
  base?: Record<string, unknown>;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
  correlationId: string;
}

// Keys whose values are always masked, no matter where they appear.
const SENSITIVE_KEYS = new Set([
  "smtp_pass",
  "password",
  "authorization",
  "service_role_key",
  "supabase_service_role_key",
  "api_key",
  "secret",
  "token",
]);

function mask(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "string") {
    if (v.length <= 4) return "***";
    return `${v.slice(0, 2)}***${v.slice(-2)}`;
  }
  return "***";
}

function redact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = mask(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level: Level, ctx: LoggerContext, msg: string, fields?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope: ctx.scope,
    correlation_id: ctx.correlationId,
    msg,
    ...redact({ ...(ctx.base || {}), ...(fields || {}) }),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(ctx: LoggerContext): Logger {
  return {
    correlationId: ctx.correlationId,
    debug: (m, f) => emit("debug", ctx, m, f),
    info: (m, f) => emit("info", ctx, m, f),
    warn: (m, f) => emit("warn", ctx, m, f),
    error: (m, f) => emit("error", ctx, m, f),
    child: (extra) =>
      createLogger({
        ...ctx,
        base: { ...(ctx.base || {}), ...extra },
      }),
  };
}