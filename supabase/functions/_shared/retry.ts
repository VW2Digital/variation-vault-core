// Retry com backoff exponencial + jitter para Edge Functions.
// Pure (sem APIs Deno específicas além de setTimeout via Promise) e tipado.
//
// Uso:
//   const result = await withRetry(
//     (attempt) => fetch(url),
//     {
//       maxAttempts: 4,
//       baseDelayMs: 250,
//       maxDelayMs: 5000,
//       isRetryable: (res) => !res.ok && res.status >= 500,
//       onAttempt: (info) => log.warn("retry_attempt", info),
//     },
//   );
//
// Política:
//   delay(n) = min(maxDelayMs, baseDelayMs * 2^(n-1)) ± jitter (full-jitter)
//   Para 503 com Retry-After (segundos), respeita o cabeçalho.
//   Erros lançados são tratados como retryable a menos que isRetryableError() devolva false.

import type { Logger } from "./logger.ts";

export interface RetryAttemptInfo {
  attempt: number;        // 1-based
  delay_ms: number;       // delay APLICADO antes desta tentativa (0 na 1ª)
  reason: string;         // "initial" | "http_5xx" | "exception" | "retry_after"
  status?: number;        // HTTP status da tentativa anterior, se houver
  error?: string;         // mensagem do erro da tentativa anterior, se houver
}

export interface RetryOptions<T> {
  maxAttempts?: number;        // default: 3
  baseDelayMs?: number;        // default: 300
  maxDelayMs?: number;         // default: 5000
  /** Se true, devolver `T`. Se false, fazer nova tentativa. */
  isRetryable?: (result: T) => boolean;
  /** Decide se uma exceção deve ser retentada. Default: true. */
  isRetryableError?: (err: unknown) => boolean;
  /** Hook de observabilidade chamado ANTES de cada tentativa (incluindo a 1ª). */
  onAttempt?: (info: RetryAttemptInfo) => void;
  /** Log opcional — se passado, registra automaticamente cada tentativa. */
  log?: Logger;
  /** Rótulo opcional usado nas mensagens de log. */
  label?: string;
}

export interface RetryResult<T> {
  result: T | null;
  error: unknown;
  attempts: number;
  total_latency_ms: number;
  succeeded: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full-jitter exponential backoff (AWS architecture blog). */
export function computeBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * exp);
}

/** Extrai segundos de Retry-After. Aceita número ou data HTTP. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const asNum = Number(value);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.min(asNum * 1000, 60_000);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    return diff > 0 ? Math.min(diff, 60_000) : 0;
  }
  return null;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions<T> = {},
): Promise<RetryResult<T>> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const base = opts.baseDelayMs ?? 300;
  const max = opts.maxDelayMs ?? 5000;
  const isRetryable = opts.isRetryable ?? (() => false);
  const isRetryableError = opts.isRetryableError ?? (() => true);
  const label = opts.label ?? "task";
  const start = Date.now();

  let lastErr: unknown = null;
  let lastResult: T | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let delay = 0;
    let reason: RetryAttemptInfo["reason"] = "initial";
    let status: number | undefined;
    let errMsg: string | undefined;

    if (attempt > 1) {
      delay = computeBackoff(attempt - 1, base, max);
      // Se a tentativa anterior trouxe Retry-After, usa-o como piso.
      if (lastResult && (lastResult as any) instanceof Response) {
        const retryAfter = parseRetryAfter(
          (lastResult as unknown as Response).headers.get("retry-after"),
        );
        if (retryAfter != null) {
          delay = Math.max(delay, retryAfter);
          reason = "retry_after";
        }
      }
      if (lastErr) {
        errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
        reason = reason === "retry_after" ? reason : "exception";
      } else if (lastResult && (lastResult as any) instanceof Response) {
        status = (lastResult as unknown as Response).status;
        if (reason !== "retry_after") reason = "http_5xx";
      }
    }

    const info: RetryAttemptInfo = { attempt, delay_ms: delay, reason, status, error: errMsg };
    opts.onAttempt?.(info);
    opts.log?.warn(`${label}_retry`, info as unknown as Record<string, unknown>);

    if (delay > 0) await sleep(delay);

    try {
      const result = await fn(attempt);
      lastResult = result;
      if (!isRetryable(result)) {
        return {
          result,
          error: null,
          attempts: attempt,
          total_latency_ms: Date.now() - start,
          succeeded: true,
        };
      }
      // Result classificado como retryable; segue o loop.
      lastErr = null;
    } catch (err) {
      lastErr = err;
      lastResult = null;
      if (!isRetryableError(err)) {
        return {
          result: null,
          error: err,
          attempts: attempt,
          total_latency_ms: Date.now() - start,
          succeeded: false,
        };
      }
    }
  }

  return {
    result: lastResult,
    error: lastErr,
    attempts: maxAttempts,
    total_latency_ms: Date.now() - start,
    succeeded: false,
  };
}
