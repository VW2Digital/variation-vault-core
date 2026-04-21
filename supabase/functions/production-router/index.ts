import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-signature, x-request-id, x-hub-signature",
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

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const shipmentId = typeof payload.shipment_id === "string" ? payload.shipment_id : "";

  if (!orderId && !shipmentId) {
    return new Response(JSON.stringify({ error: "Provide order_id or shipment_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    return new Response(JSON.stringify({ error: "No valid fields provided for update" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  updatePayload.updated_at = new Date().toISOString();

  const matchField = orderId ? "id" : "shipment_id";
  const matchValue = orderId || shipmentId;

  const { data, error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq(matchField, matchValue)
    .select("id, status, delivery_status, shipping_status, tracking_code, shipment_id, payment_gateway, gateway_environment")
    .maybeSingle();

  if (error) {
    await logApiCall(route, 500, payload, error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!data) {
    await logApiCall(route, 404, payload, "Order not found");
    return new Response(JSON.stringify({ error: "Order not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (route === "/api/shipping/status") {
    await supabase.from("shipping_logs").insert({
      order_id: data.id,
      event_type: "api_shipping_status_update",
      request_payload: payload,
      response_payload: data,
      error_message: null,
    });
  }

  await logApiCall(route, 200, payload);

  return new Response(JSON.stringify({ success: true, order: data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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