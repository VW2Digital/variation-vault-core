// Helper compartilhado para gerenciar a fila `webhook_retry_queue`.
// Webhooks inbound chamam `enqueueWebhookRetry()` quando falham internamente
// (ex.: erro ao atualizar pedido, erro de network). A função `webhook-retry`
// (acionada por pg_cron) consome essa fila com backoff exponencial.

import { computeBackoff } from "./retry.ts";
import type { Logger } from "./logger.ts";

const DEFAULT_MAX_ATTEMPTS = 6;

export interface EnqueueRetryArgs {
  /** Cliente service-role do Supabase. */
  supabase: any;
  gateway: string;             // 'pagarme' | 'mercadopago' | 'asaas' | 'pagbank' | 'melhor-envio'
  function_name: string;       // ex.: 'pagarme-webhook'
  payload: unknown;
  headers?: Record<string, string>;
  external_id?: string | null;
  correlation_id?: string;
  initial_error?: string;
  max_attempts?: number;
  log?: Logger;
}

/** Enfileira um webhook para reprocessamento. Retorna o id da linha (ou null em erro). */
export async function enqueueWebhookRetry(args: EnqueueRetryArgs): Promise<string | null> {
  const baseDelay = 30_000; // 30s
  const next = new Date(Date.now() + baseDelay).toISOString();
  const row = {
    gateway: args.gateway,
    function_name: args.function_name,
    request_payload: args.payload as any,
    request_headers: args.headers ?? null,
    external_id: args.external_id ?? null,
    correlation_id: args.correlation_id ?? null,
    last_error: args.initial_error ?? null,
    max_attempts: args.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
    next_attempt_at: next,
    status: "pending",
    attempts: 0,
  };
  const { data, error } = await args.supabase
    .from("webhook_retry_queue")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) {
    args.log?.error("enqueue_retry_failed", { error: error.message, gateway: args.gateway });
    return null;
  }
  args.log?.info("enqueued_retry", {
    id: data?.id,
    gateway: args.gateway,
    function: args.function_name,
    next_attempt_at: next,
  });
  return data?.id ?? null;
}

/** Calcula próximo agendamento para uma tentativa N. */
export function nextAttemptDelayMs(attempt: number): number {
  // baseDelay 30s, max 30min, full-jitter
  return Math.max(5_000, computeBackoff(attempt, 30_000, 30 * 60_000));
}
