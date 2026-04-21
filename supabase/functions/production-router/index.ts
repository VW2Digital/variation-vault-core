import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-signature, x-request-id, x-hub-signature, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const WEBHOOK_ROUTE_MAP: Record<string, string | null> = {
  "/api/webhooks/asaas": "asaas-webhook",
  "/api/webhooks/melhor-envio": "melhor-envio-webhook",
  "/api/webhooks/mercado-pago": "mercadopago-webhook",
  "/api/webhooks/pagarme": "pagarme-webhook",
  "/api/webhooks/pagbank": "pagbank-webhook",
  "/api/webhooks/stripe": null,
};

const UPDATE_FIELDS = new Set([
  "status",
  "payment_method",
  "payment_gateway",
  "gateway_environment",
  "asaas_payment_id",
  "installments",
  "total_value",
  "unit_price",
  "coupon_code",
  "coupon_discount",
  "delivery_status",
  "shipping_status",
  "tracking_code",
  "tracking_url",
  "label_url",
  "shipment_id",
  "shipping_service",
  "shipping_cost",
  "selected_service_id",
]);

const SHIPPING_FIELDS = new Set([
  "delivery_status",
  "shipping_status",
  "tracking_code",
  "tracking_url",
  "label_url",
  "shipment_id",
  "shipping_service",
  "shipping_cost",
  "selected_service_id",
]);

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function sha256Hex(input: string): Promise<string> {
  const buffer = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function getRoutePath(req: Request) {
  const pathname = new URL(req.url).pathname;
  const apiIndex = pathname.indexOf("/api/");
  if (apiIndex >= 0) return pathname.slice(apiIndex);

  const routerIndex = pathname.indexOf("/production-router");
  if (routerIndex >= 0) {
    const remainder = pathname.slice(routerIndex + "/production-router".length);
    return remainder || "/";
  }

  return pathname;
}

async function getOrdersApiKey(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "orders_api_key")
    .maybeSingle();

  return data?.value?.trim() || "";
}

async function requireApiKey(req: Request, supabase: ReturnType<typeof createClient>) {
  const provided = req.headers.get("x-api-key")?.trim();
  const expected = await getOrdersApiKey(supabase);

  if (!provided || !expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return null;
}

async function logApiCall(route: string, status: number, payload: unknown, errorMessage?: string) {
  try {
    const supabase = getServiceClient();
    await supabase.from("webhook_logs").insert({
      gateway: "production-api",
      event_type: route,
      http_status: status,
      request_payload: payload,
      error_message: errorMessage ?? null,
      signature_valid: null,
      signature_error: null,
      request_headers: null,
      order_id: null,
      external_id: null,
      latency_ms: null,
    });
  } catch (error) {
    console.error("[production-router] log failure", error);
  }
}

async function proxyWebhook(targetFunction: string, req: Request, rawBody: string) {
  const url = new URL(req.url);
  const upstreamUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${targetFunction}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: req.method === "GET" ? undefined : rawBody,
  });

  const responseText = await upstream.text();

  return new Response(responseText, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    },
  });
}

async function updateOrderRecord(
  req: Request,
  route: string,
  allowedFields: Set<string>,
) {
  const supabase = getServiceClient();
  const unauthorized = await requireApiKey(req, supabase);
  if (unauthorized) return unauthorized;

  const rawBody = await req.text();
  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== "object") {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const shipmentId = typeof payload.shipment_id === "string" ? payload.shipment_id : "";

  if (!orderId && !shipmentId) {
    return jsonResponse(400, { error: "Provide order_id or shipment_id" });
  }

  // ----- Idempotência -----
  // Prioridade: header Idempotency-Key. Fallback: hash(route + body).
  const headerKey = req.headers.get("idempotency-key")?.trim() || "";
  const requestHash = await sha256Hex(`${route}\n${rawBody}`);
  const idempotencyKey = headerKey
    ? `hdr:${route}:${headerKey}`
    : `auto:${route}:${requestHash}`;

  const { data: cached } = await supabase
    .from("api_idempotency_keys")
    .select("response_status, response_body, request_hash, expires_at")
    .eq("key", idempotencyKey)
    .maybeSingle();

  if (cached) {
    const isExpired = new Date(cached.expires_at as string).getTime() < Date.now();
    if (!isExpired) {
      // Header explícito com hash diferente => conflito (rejeitar 409)
      if (headerKey && cached.request_hash !== requestHash) {
        return jsonResponse(409, {
          error: "Idempotency-Key reutilizada com payload diferente",
          idempotency_key: headerKey,
        });
      }
      // Replay: devolve a resposta original
      return jsonResponse(
        cached.response_status as number,
        cached.response_body,
        { "Idempotent-Replay": "true" },
      );
    }
  }

  const updatePayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (allowedFields.has(key) && value !== undefined) {
      updatePayload[key] = value;
    }
  }

  if (route === "/api/payment/confirm" && typeof payload.payment_id === "string" && !updatePayload.asaas_payment_id) {
    updatePayload.asaas_payment_id = payload.payment_id;
  }

  if (Object.keys(updatePayload).length === 0) {
    return jsonResponse(400, { error: "No valid fields provided for update" });
  }

  updatePayload.updated_at = new Date().toISOString();

  const matchField = orderId ? "id" : "shipment_id";
  const matchValue = orderId || shipmentId;

  // Lê o estado atual ANTES de aplicar para detectar no-op (mesmo dado já presente)
  const { data: existing } = await supabase
    .from("orders")
    .select("id, status, delivery_status, shipping_status, tracking_code, shipment_id, payment_gateway, gateway_environment, asaas_payment_id")
    .eq(matchField, matchValue)
    .maybeSingle();

  if (!existing) {
    const responseBody = { error: "Order not found" };
    await logApiCall(route, 404, payload, "Order not found");
    return jsonResponse(404, responseBody);
  }

  // No-op: todos os campos a atualizar já têm o valor desejado → não toca no banco
  let didChange = false;
  for (const [key, value] of Object.entries(updatePayload)) {
    if (key === "updated_at") continue;
    if ((existing as Record<string, unknown>)[key] !== value) {
      didChange = true;
      break;
    }
  }

  let data: Record<string, unknown> | null = existing as Record<string, unknown>;
  let error: { message: string } | null = null;

  if (didChange) {
    const updateRes = await supabase
      .from("orders")
      .update(updatePayload)
      .eq(matchField, matchValue)
      .select("id, status, delivery_status, shipping_status, tracking_code, shipment_id, payment_gateway, gateway_environment, asaas_payment_id")
      .maybeSingle();
    data = (updateRes.data as Record<string, unknown> | null) ?? data;
    error = updateRes.error ? { message: updateRes.error.message } : null;
  }

  if (error) {
    await logApiCall(route, 500, payload, error.message);
    return jsonResponse(500, { error: error.message });
  }

  if (route === "/api/shipping/status" && didChange) {
    await supabase.from("shipping_logs").insert({
      order_id: (data as Record<string, unknown>).id,
      event_type: "api_shipping_status_update",
      request_payload: payload,
      response_payload: data,
      error_message: null,
    });
  }

  await logApiCall(route, 200, payload);

  const responseBody = {
    success: true,
    order: data,
    idempotent: !didChange,
  };

  // Persiste resultado para futuras retentativas (TTL 24h via default da tabela)
  await supabase
    .from("api_idempotency_keys")
    .upsert({
      key: idempotencyKey,
      route,
      request_hash: requestHash,
      response_status: 200,
      response_body: responseBody,
      order_id: (data as { id?: string })?.id ?? null,
    }, { onConflict: "key" });

  return jsonResponse(200, responseBody);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const route = getRoutePath(req);
  const isWebhookRoute = route in WEBHOOK_ROUTE_MAP;

  if (req.method === "GET") {
    const target = isWebhookRoute ? WEBHOOK_ROUTE_MAP[route] : route;
    const status = route === "/api/webhooks/stripe" ? 501 : 200;
    return new Response(JSON.stringify({ ok: status === 200, route, target }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (isWebhookRoute) {
      const targetFunction = WEBHOOK_ROUTE_MAP[route];
      const rawBody = await req.text();

      if (!targetFunction) {
        await logApiCall(route, 501, rawBody, "Stripe webhook not implemented in this repository");
        return new Response(JSON.stringify({ error: "Stripe webhook not implemented in this repository" }), {
          status: 501,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const proxied = await proxyWebhook(targetFunction, req, rawBody);
      await logApiCall(route, proxied.status, rawBody, proxied.ok ? undefined : `Upstream returned ${proxied.status}`);
      return proxied;
    }

    if (route === "/api/payment/confirm") {
      return await updateOrderRecord(req, route, UPDATE_FIELDS);
    }

    if (route === "/api/order/update") {
      return await updateOrderRecord(req, route, UPDATE_FIELDS);
    }

    if (route === "/api/shipping/status") {
      return await updateOrderRecord(req, route, SHIPPING_FIELDS);
    }

    return new Response(JSON.stringify({ error: "Route not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logApiCall(route, 500, null, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});