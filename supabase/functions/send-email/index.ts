// Centralized transactional email dispatcher.
// Single entry point for all app emails (order, shipping, payment, custom).
// - Renders one of the registered templates and sends via Resend
// - Authenticates either with a Supabase JWT (admin) or with the
//   service role key (server-side / Edge Function -> Edge Function)
// - Never logs API keys or secrets in plain text
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PUBLIC_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "msn.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
];

type TemplateName =
  | "order_created"
  | "order_paid"
  | "shipping_update"
  | "payment_failure"
  | "cart_abandonment"
  | "admin_notification"
  | "custom";

interface SendEmailRequest {
  template: TemplateName;
  to: string | string[];
  subject?: string;
  data?: Record<string, any>;
  // For "custom"
  html?: string;
  text?: string;
}

const baseStyles = `font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background:#ffffff; color:#1a1a2e;`;

const wrap = (storeName: string, content: string, footer?: string) => `
  <div style="${baseStyles}">
    <h2 style="margin:0 0 12px;">${storeName}</h2>
    ${content}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
    <p style="color:#999;font-size:12px;margin:0;">${footer ?? "Este é um email automático, não responda diretamente."}</p>
  </div>
`;

const brl = (n: number) =>
  Number.isFinite(n) ? `R$ ${Number(n).toFixed(2).replace(".", ",")}` : "—";

function renderTemplate(
  template: TemplateName,
  data: Record<string, any>,
  storeName: string,
  storeUrl: string,
): { subject: string; html: string } {
  const customer = data?.customer_name || data?.full_name || "Cliente";

  switch (template) {
    case "order_created": {
      const subject = `Pedido recebido — ${data.product_name ?? "seu pedido"}`;
      const html = wrap(
        storeName,
        `
          <p>Olá <strong>${customer}</strong>,</p>
          <p>Recebemos seu pedido <strong>#${data.order_id ?? "—"}</strong> e ele já está na fila.</p>
          <p><strong>Produto:</strong> ${data.product_name ?? "—"}<br/>
             <strong>Valor:</strong> ${brl(data.total_value)}<br/>
             <strong>Pagamento:</strong> ${data.payment_method ?? "—"}</p>
          ${storeUrl ? `<p><a href="${storeUrl}/minha-conta" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Ver meu pedido</a></p>` : ""}
        `,
      );
      return { subject, html };
    }
    case "order_paid": {
      const subject = `Pagamento confirmado — pedido #${data.order_id ?? ""}`;
      const html = wrap(
        storeName,
        `
          <p>Olá <strong>${customer}</strong>,</p>
          <p>Seu pagamento foi <strong>confirmado</strong>! Já estamos preparando o envio.</p>
          <p><strong>Pedido:</strong> #${data.order_id ?? "—"}<br/>
             <strong>Total:</strong> ${brl(data.total_value)}</p>
        `,
      );
      return { subject, html };
    }
    case "shipping_update": {
      const subject = `Atualização do envio — ${data.tracking_code ?? "pedido em trânsito"}`;
      const trackBlock = data.tracking_url
        ? `<p><a href="${data.tracking_url}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Rastrear envio</a></p>`
        : "";
      const html = wrap(
        storeName,
        `
          <p>Olá <strong>${customer}</strong>,</p>
          <p>Status atual: <strong>${data.status ?? "atualizado"}</strong></p>
          ${data.tracking_code ? `<p><strong>Código de rastreio:</strong> ${data.tracking_code}</p>` : ""}
          ${trackBlock}
        `,
      );
      return { subject, html };
    }
    case "payment_failure": {
      const subject = `Falha no pagamento — pedido #${data.order_id ?? ""}`;
      const html = wrap(
        storeName,
        `
          <p>Olá <strong>${customer}</strong>,</p>
          <p>Tivemos um problema processando seu pagamento.</p>
          <p><strong>Motivo:</strong> ${data.error_message ?? "não informado"}</p>
          ${storeUrl ? `<p><a href="${storeUrl}/minha-conta" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Tentar novamente</a></p>` : ""}
        `,
      );
      return { subject, html };
    }
    case "cart_abandonment": {
      const items = Array.isArray(data.items) ? data.items : [];
      const itemsHtml = items
        .map(
          (i: any) =>
            `<tr><td style="padding:6px 0;">${i.product_name ?? ""} ${i.dosage ? `(${i.dosage})` : ""} x${i.quantity ?? 1}</td><td style="text-align:right;">${brl((i.price ?? 0) * (i.quantity ?? 1))}</td></tr>`,
        )
        .join("");
      const cartUrl = storeUrl ? `${storeUrl}/carrinho` : "#";
      const subject = `${customer}, seus itens estão esperando por você!`;
      const html = wrap(
        storeName,
        `
          <p>Olá <strong>${customer}</strong>,</p>
          <p>Você deixou alguns itens no carrinho. Garanta antes que esgote!</p>
          <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
          <p style="text-align:right;font-weight:bold;">Total: ${brl(data.total_value)}</p>
          <p><a href="${cartUrl}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Finalizar minha compra</a></p>
        `,
      );
      return { subject, html };
    }
    case "admin_notification": {
      const subject = data.subject ?? `Notificação interna — ${storeName}`;
      const html = wrap(
        storeName,
        `
          <p><strong>Evento:</strong> ${data.event ?? "—"}</p>
          <p>${data.message ?? ""}</p>
          ${data.details ? `<pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto;">${escapeHtml(JSON.stringify(data.details, null, 2))}</pre>` : ""}
        `,
        "Notificação automática enviada pelo sistema.",
      );
      return { subject, html };
    }
    default:
      throw new Error(`Template desconhecido: ${template}`);
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    // Two valid auth modes:
    // 1) Service role key (server-to-server, e.g. webhooks calling this fn)
    // 2) Admin JWT (called from the admin panel)
    let isAuthorized = false;
    if (token && token === serviceRoleKey) {
      isAuthorized = true;
    } else if (token) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claimsData } = await userClient.auth.getClaims(token);
      const callerId = claimsData?.claims?.sub;
      if (callerId) {
        const admin = createClient(supabaseUrl, serviceRoleKey);
        const { data: roleRow } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", callerId)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return json(401, { error: "Unauthorized" });
    }

    const body = (await req.json()) as SendEmailRequest;
    if (!body?.template || !body?.to) {
      return json(400, { error: "Campos obrigatórios: template, to" });
    }
    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    if (recipients.some((r) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r))) {
      return json(400, { error: "Email destinatário inválido" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: settings } = await admin
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "resend_api_key",
        "resend_from_email",
        "store_public_url",
        "store_name",
        // Template overrides (one row per key)
        `email_template_${body.template}_subject`,
        `email_template_${body.template}_html`,
      ]);
    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => (cfg[s.key] = s.value));

    const resendApiKey = cfg["resend_api_key"] || Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return json(500, {
        error: "RESEND_API_KEY ausente. Configure em Configurações → Comunicação ou nas secrets do Supabase.",
      });
    }

    const storeName = cfg["store_name"] || "Liberty Pharma";
    const storePublicUrl = (cfg["store_public_url"] || "").replace(/\/+$/, "");
    const configuredFrom = cfg["resend_from_email"] || "";
    const fromDomain = configuredFrom.split("@")[1]?.toLowerCase() || "";
    const isPublicDomain = PUBLIC_DOMAINS.includes(fromDomain);
    const fromEmail =
      isPublicDomain || !configuredFrom ? "onboarding@resend.dev" : configuredFrom;
    const replyTo =
      configuredFrom && configuredFrom.includes("@") ? configuredFrom : undefined;

    let rendered: { subject: string; html: string };
    if (body.template === "custom") {
      if (!body.html && !body.text) {
        return json(400, { error: "custom requer html ou text" });
      }
      rendered = {
        subject: body.subject || `Mensagem de ${storeName}`,
        html: body.html || `<pre>${escapeHtml(body.text!)}</pre>`,
      };
    } else {
      rendered = renderTemplate(body.template, body.data || {}, storeName, storePublicUrl);
      if (body.subject) rendered.subject = body.subject;
    }

    // Apply admin overrides from site_settings (if defined).
    // Supports {{var}} placeholders that map to keys in body.data, plus
    // {{store_name}}, {{store_url}}, {{customer_name}}.
    const overrideSubject = cfg[`email_template_${body.template}_subject`];
    const overrideHtml = cfg[`email_template_${body.template}_html`];
    if (overrideSubject || overrideHtml) {
      const vars: Record<string, string> = {
        store_name: storeName,
        store_url: storePublicUrl,
        customer_name:
          (body.data?.customer_name as string) ||
          (body.data?.full_name as string) ||
          "Cliente",
      };
      for (const [k, v] of Object.entries(body.data || {})) {
        if (v == null) continue;
        vars[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      const interpolate = (s: string) =>
        s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) =>
          vars[key] !== undefined ? vars[key] : "",
        );
      if (overrideSubject) rendered.subject = interpolate(overrideSubject);
      if (overrideHtml) rendered.html = interpolate(overrideHtml);
      if (body.subject) rendered.subject = body.subject;
    }

    const sendStart = Date.now();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${storeName} <${fromEmail}>`,
        to: recipients,
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: rendered.subject,
        html: rendered.html,
      }),
    });
    const latency = Date.now() - sendStart;
    const resBody = await res.json().catch(() => ({}));

    // Persist a row per recipient in email_send_log (best-effort).
    const logRows = recipients.map((r) => ({
      message_id: resBody?.id ?? null,
      template_name: body.template,
      recipient_email: r,
      subject: rendered.subject,
      status: res.ok ? "sent" : "failed",
      error_message: res.ok
        ? null
        : (resBody?.message || resBody?.name || `HTTP ${res.status}`),
      provider_response: resBody ?? null,
      metadata: {
        from_used: fromEmail,
        fallback: isPublicDomain,
        latency_ms: latency,
        provider_status: res.status,
      },
    }));
    admin.from("email_send_log").insert(logRows).then(({ error }) => {
      if (error) console.error("email_send_log insert error:", error.message);
    });

    if (!res.ok) {
      // Diagnostic log WITHOUT secrets
      console.error(JSON.stringify({
        scope: "send-email",
        template: body.template,
        to_count: recipients.length,
        from_used: fromEmail,
        fallback: isPublicDomain,
        provider_status: res.status,
        provider_error: resBody?.message ?? resBody?.name ?? "unknown",
        latency_ms: latency,
      }));
      return json(502, {
        error: resBody?.message || "Provedor recusou o envio",
        provider_status: res.status,
      });
    }

    console.log(JSON.stringify({
      scope: "send-email",
      template: body.template,
      to_count: recipients.length,
      from_used: fromEmail,
      fallback: isPublicDomain,
      latency_ms: latency,
      message_id: resBody?.id,
    }));

    return json(200, {
      success: true,
      message_id: resBody?.id,
      fallback: isPublicDomain,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-email fatal:", msg);
    return json(500, { error: msg });
  }
});