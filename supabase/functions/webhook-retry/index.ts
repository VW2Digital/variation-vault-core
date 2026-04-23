// Worker que consome `webhook_retry_queue` e re-invoca a Edge Function alvo
// com backoff exponencial. Acionado por pg_cron (recomendado a cada 1 min).
//
// Política:
//   - Pega até BATCH_SIZE itens com status='pending' e next_attempt_at <= now()
//   - Marca como 'processing', re-invoca a função alvo com o payload original
//   - Sucesso (2xx) → status='succeeded'
//   - Falha → attempts++, calcula próximo delay e volta a 'pending';
//             se attempts >= max_attempts → status='dead_letter'
//   - Logs estruturados com correlation id por linha processada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorrelationId, json, preflight } from "../_shared/http.ts";
import { createLogger } from "../_shared/logger.ts";
import { nextAttemptDelayMs } from "../_shared/webhook-retry.ts";

const BATCH_SIZE = 10;

serve(async (req) => {
  const correlationId = getCorrelationId(req);
  const pre = preflight(req, correlationId);
  if (pre) return pre;

  const log = createLogger({ scope: "webhook-retry", correlationId });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // Pega itens devidos
  const { data: due, error: selErr } = await sb
    .from("webhook_retry_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (selErr) {
    log.error("queue_select_failed", { error: selErr.message });
    return json(500, { error: selErr.message, correlation_id: correlationId }, correlationId);
  }
  if (!due || due.length === 0) {
    return json(200, { processed: 0, correlation_id: correlationId }, correlationId);
  }

  // Marca todos como 'processing' (lock otimista por updated_at)
  const ids = due.map((r: any) => r.id);
  await sb.from("webhook_retry_queue")
    .update({ status: "processing" })
    .in("id", ids);

  let succeeded = 0, failed = 0, dead = 0;
  for (const item of due) {
    const itemLog = log.child({
      retry_id: item.id,
      gateway: item.gateway,
      function: item.function_name,
      attempt: item.attempts + 1,
      origin_correlation_id: item.correlation_id,
    });
    const url = `${supabaseUrl}/functions/v1/${item.function_name}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      "x-correlation-id": item.correlation_id || correlationId,
      "x-webhook-retry": "1",
      "x-webhook-retry-attempt": String(item.attempts + 1),
    };
    // Re-injeta headers críticos de assinatura quando disponíveis
    const stored = (item.request_headers || {}) as Record<string, string>;
    for (const k of Object.keys(stored)) {
      const lk = k.toLowerCase();
      if (lk.startsWith("x-hub-signature") || lk.startsWith("x-signature") ||
          lk.startsWith("asaas-access-token") || lk.startsWith("x-pagbank")) {
        headers[k] = stored[k];
      }
    }

    let status = 0;
    let errMsg: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: typeof item.request_payload === "string"
          ? item.request_payload
          : JSON.stringify(item.request_payload),
      });
      status = res.status;
      if (!res.ok) {
        errMsg = `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`;
      }
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    const newAttempts = item.attempts + 1;
    if (!errMsg && status >= 200 && status < 300) {
      succeeded++;
      await sb.from("webhook_retry_queue").update({
        status: "succeeded",
        attempts: newAttempts,
        last_status: status,
        last_error: null,
      }).eq("id", item.id);
      itemLog.info("retry_succeeded", { status, attempts: newAttempts });
    } else if (newAttempts >= item.max_attempts) {
      dead++;
      await sb.from("webhook_retry_queue").update({
        status: "dead_letter",
        attempts: newAttempts,
        last_status: status,
        last_error: errMsg,
      }).eq("id", item.id);
      itemLog.error("retry_dead_letter", { status, attempts: newAttempts, error: errMsg });
    } else {
      failed++;
      const delay = nextAttemptDelayMs(newAttempts);
      const next = new Date(Date.now() + delay).toISOString();
      await sb.from("webhook_retry_queue").update({
        status: "pending",
        attempts: newAttempts,
        last_status: status,
        last_error: errMsg,
        next_attempt_at: next,
      }).eq("id", item.id);
      itemLog.warn("retry_rescheduled", {
        status,
        attempts: newAttempts,
        delay_ms: delay,
        next_attempt_at: next,
        error: errMsg,
      });
    }
  }

  log.info("batch_done", {
    picked: due.length, succeeded, failed, dead_letter: dead,
  });
  return json(200, {
    processed: due.length, succeeded, failed, dead_letter: dead,
    correlation_id: correlationId,
  }, correlationId);
});
