// Dedicated event endpoint that maps domain events to email templates
// and forwards them to the centralized `send-email` function.
//
// Auth: same model as send-email — accepts a Supabase admin JWT or the
// service role key. Never logs secrets.
//
// Logs are structured JSON with a correlation id that is propagated to
// `send-email` (via the X-Correlation-ID header). The same id ends up in
// the email_send_log row metadata, so a single id traces the full path:
// caller → email-events → send-email → SMTP provider → DB log.
//
// Usage:
//   POST /functions/v1/email-events
//   { "event": "order_paid", "to": "x@y.com", "data": { ... } }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorrelationId, json, preflight } from "../_shared/http.ts";
import { createLogger } from "../_shared/logger.ts";
import { authorizeAdminOrServiceRole } from "../_shared/auth.ts";

type EventName =
  | "order_paid"
  | "shipping_update"
  | "payment_failure"
  | "cart_abandonment"
  | "order_created"
  | "plan_expiring"
  | "admin_notification";

const EVENT_TO_TEMPLATE: Record<EventName, string> = {
  order_paid: "order_paid",
  shipping_update: "shipping_update",
  payment_failure: "payment_failure",
  cart_abandonment: "cart_abandonment",
  order_created: "order_created",
  plan_expiring: "plan_expiring",
  admin_notification: "admin_notification",
};

interface EventRequest {
  event: EventName;
  to?: string | string[];
  order_id?: string;
  data?: Record<string, unknown>;
  subject?: string;
}

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

serve(async (req) => {
  const correlationId = getCorrelationId(req);
  const pre = preflight(req, correlationId);
  if (pre) return pre;
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed", correlation_id: correlationId }, correlationId);
  }

  const log = createLogger({ scope: "email-events", correlationId });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authz = await authorizeAdminOrServiceRole(req);
    if (!authz.authorized) {
      log.warn("unauthorized", { caller: authz.caller });
      return json(401, { error: "Unauthorized", correlation_id: correlationId }, correlationId);
    }

    const body = (await req.json().catch(() => null)) as EventRequest | null;
    if (!body?.event) {
      return json(400, { error: "event é obrigatório", correlation_id: correlationId }, correlationId);
    }
    const template = EVENT_TO_TEMPLATE[body.event];
    if (!template) {
      return json(400, { error: `Evento desconhecido: ${body.event}`, correlation_id: correlationId }, correlationId);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Hydrate from order if order_id passed
    let recipients: string[] = [];
    let templateData: Record<string, unknown> = { ...(body.data || {}) };

    if (body.order_id) {
      const { data: order, error } = await admin
        .from("orders")
        .select("*")
        .eq("id", body.order_id)
        .maybeSingle();
      if (error) {
        return json(404, { error: `Pedido não encontrado: ${error.message}` });
      }
      if (order) {
        templateData = {
          order_id: order.id,
          customer_name: order.customer_name,
          product_name: order.product_name,
          total_value: order.total_value,
          payment_method: order.payment_method,
          tracking_code: order.tracking_code,
          tracking_url: order.tracking_url,
          status: order.status,
          delivery_status: order.delivery_status,
          ...templateData,
        };
        if (order.customer_email && isEmail(order.customer_email)) {
          recipients.push(order.customer_email);
        }
      }
    }

    if (body.to) {
      const list = Array.isArray(body.to) ? body.to : [body.to];
      for (const r of list) if (isEmail(r) && !recipients.includes(r)) recipients.push(r);
    }

    // Admin notifications fall back to configured admin email if no `to` given
    if (body.event === "admin_notification" && recipients.length === 0) {
      const { data: row } = await admin
        .from("site_settings")
        .select("value")
        .eq("key", "admin_notification_email")
        .maybeSingle();
      if (row?.value && isEmail(row.value)) recipients.push(row.value);
    }

    if (recipients.length === 0) {
      return json(400, { error: "Nenhum destinatário válido (informe `to` ou `order_id` com email válido)" });
    }

    // Forward to send-email using service role (server-to-server)
    const sendStart = Date.now();
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template,
        to: recipients,
        subject: body.subject,
        data: templateData,
      }),
    });
    const latency = Date.now() - sendStart;
    const respBody = await sendRes.json().catch(() => ({}));

    if (!sendRes.ok) {
      console.error(JSON.stringify({
        scope: "email-events",
        event: body.event,
        order_id: body.order_id ?? null,
        to_count: recipients.length,
        forward_status: sendRes.status,
        forward_error: (respBody as any)?.error ?? "unknown",
        latency_ms: latency,
      }));
      return json(502, {
        error: (respBody as any)?.error || "Falha ao despachar email",
        forward_status: sendRes.status,
      });
    }

    console.log(JSON.stringify({
      scope: "email-events",
      event: body.event,
      order_id: body.order_id ?? null,
      to_count: recipients.length,
      message_id: (respBody as any)?.message_id,
      latency_ms: latency,
    }));

    return json(200, {
      success: true,
      event: body.event,
      template,
      to: recipients,
      message_id: (respBody as any)?.message_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("email-events fatal:", msg);
    return json(500, { error: msg });
  }
});