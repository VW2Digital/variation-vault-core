import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface CheckResult {
  name: string;
  category: "webhook" | "infra" | "integration";
  endpoint: string;
  expected_status: number[];
  actual_status: number | null;
  ok: boolean;
  latency_ms: number | null;
  message: string;
  details?: Record<string, unknown>;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function probe(
  name: string,
  category: CheckResult["category"],
  endpoint: string,
  init: RequestInit,
  expected: number[],
  describe: (status: number, body: string) => string,
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(endpoint, init);
    const body = await res.text();
    const latency = Date.now() - start;
    const ok = expected.includes(res.status);
    return {
      name,
      category,
      endpoint,
      expected_status: expected,
      actual_status: res.status,
      ok,
      latency_ms: latency,
      message: describe(res.status, body),
      details: { body_preview: body.slice(0, 240) },
    };
  } catch (error) {
    return {
      name,
      category,
      endpoint,
      expected_status: expected,
      actual_status: null,
      ok: false,
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkSupabaseDb(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const supabase = svc();
    const { error } = await supabase.from("site_settings").select("key").limit(1);
    if (error) throw error;
    return {
      name: "Supabase Database",
      category: "infra",
      endpoint: SUPABASE_URL,
      expected_status: [200],
      actual_status: 200,
      ok: true,
      latency_ms: Date.now() - start,
      message: "Conexão com banco OK e RLS respondendo.",
    };
  } catch (error) {
    return {
      name: "Supabase Database",
      category: "infra",
      endpoint: SUPABASE_URL,
      expected_status: [200],
      actual_status: null,
      ok: false,
      latency_ms: Date.now() - start,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function recentLogs(gateway: string, limit = 3) {
  try {
    const supabase = svc();
    const { data } = await supabase
      .from("webhook_logs")
      .select("created_at, http_status, event_type, signature_valid, error_message")
      .eq("gateway", gateway)
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  // Probes — usamos GET (ou POST vazio) só para validar conectividade/handlers.
  // As funções de webhook devem responder mesmo com payload inválido (200/400/405),
  // o que comprova que estão deployadas e acessíveis.
  const probes: Promise<CheckResult>[] = [
    probe(
      "Mercado Pago Webhook",
      "webhook",
      `${FUNCTIONS_BASE}/mercadopago-webhook`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      [200, 400, 401],
      (s) => s === 401 ? "Função ativa, assinatura HMAC inválida (esperado em teste)." : `Função ativa (status ${s}).`,
    ),
    probe(
      "Melhor Envio Webhook",
      "webhook",
      `${FUNCTIONS_BASE}/melhor-envio-webhook`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      [200, 400],
      (s) => `Função ativa (status ${s}).`,
    ),
    probe(
      "Asaas Webhook",
      "webhook",
      `${FUNCTIONS_BASE}/asaas-webhook`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      [200, 400, 401],
      (s) => `Função ativa (status ${s}).`,
    ),
    probe(
      "Pagar.me Webhook",
      "webhook",
      `${FUNCTIONS_BASE}/pagarme-webhook`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      [200, 400, 401],
      (s) => `Função ativa (status ${s}).`,
    ),
    probe(
      "PagBank Webhook",
      "webhook",
      `${FUNCTIONS_BASE}/pagbank-webhook`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      [200, 400, 401],
      (s) => `Função ativa (status ${s}).`,
    ),
    probe(
      "Stripe Webhook",
      "webhook",
      `${FUNCTIONS_BASE}/production-router/api/webhooks/stripe`,
      { method: "GET" },
      [200, 501],
      (s) => s === 501
        ? "Rota mapeada porém Stripe não está implementado neste repositório."
        : `Rota responde (status ${s}).`,
    ),
    probe(
      "Production Router /api",
      "infra",
      `${FUNCTIONS_BASE}/production-router/api/payment/confirm`,
      { method: "GET" },
      [200],
      () => "Router de /api ativo e roteando.",
    ),
    checkSupabaseDb(),
  ];

  const results = await Promise.all(probes);

  // Anexa últimas execuções reais por gateway (a partir de webhook_logs)
  const [mp, me, asaas, pagarme, pagbank] = await Promise.all([
    recentLogs("mercadopago"),
    recentLogs("melhor-envio"),
    recentLogs("asaas"),
    recentLogs("pagarme"),
    recentLogs("pagbank"),
  ]);

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };

  const body = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    summary,
    checks: results,
    recent_webhook_calls: {
      mercadopago: mp,
      melhor_envio: me,
      asaas,
      pagarme,
      pagbank,
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});