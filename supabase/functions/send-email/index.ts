// Centralized transactional email dispatcher.
// Uses SMTP (Hostinger ou qualquer SMTP) como ÚNICO provider.
// Não há fallback Resend — o projeto removeu qualquer dependência da
// Resend API. Para alta entregabilidade, configure SPF/DKIM/DMARC do
// domínio do remetente.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

type TemplateName =
  | "order_created"
  | "order_paid"
  | "shipping_update"
  | "payment_failure"
  | "cart_abandonment"
  | "plan_expiring"
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

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
      const html = wrap(storeName, `
        <p>Olá <strong>${customer}</strong>,</p>
        <p>Recebemos seu pedido <strong>#${data.order_id ?? "—"}</strong> e ele já está na fila.</p>
        <p><strong>Produto:</strong> ${data.product_name ?? "—"}<br/>
           <strong>Valor:</strong> ${brl(data.total_value)}<br/>
           <strong>Pagamento:</strong> ${data.payment_method ?? "—"}</p>
        ${storeUrl ? `<p><a href="${storeUrl}/minha-conta" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Ver meu pedido</a></p>` : ""}
      `);
      return { subject, html };
    }
    case "order_paid": {
      const subject = `Pagamento confirmado — pedido #${data.order_id ?? ""}`;
      const html = wrap(storeName, `
        <p>Olá <strong>${customer}</strong>,</p>
        <p>Seu pagamento foi <strong>confirmado</strong>! Já estamos preparando o envio.</p>
        <p><strong>Pedido:</strong> #${data.order_id ?? "—"}<br/>
           <strong>Total:</strong> ${brl(data.total_value)}</p>
      `);
      return { subject, html };
    }
    case "shipping_update": {
      const subject = `Atualização do envio — ${data.tracking_code ?? "pedido em trânsito"}`;
      const trackBlock = data.tracking_url
        ? `<p><a href="${data.tracking_url}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Rastrear envio</a></p>`
        : "";
      const html = wrap(storeName, `
        <p>Olá <strong>${customer}</strong>,</p>
        <p>Status atual: <strong>${data.status ?? "atualizado"}</strong></p>
        ${data.tracking_code ? `<p><strong>Código de rastreio:</strong> ${data.tracking_code}</p>` : ""}
        ${trackBlock}
      `);
      return { subject, html };
    }
    case "payment_failure": {
      const subject = `Falha no pagamento — pedido #${data.order_id ?? ""}`;
      const html = wrap(storeName, `
        <p>Olá <strong>${customer}</strong>,</p>
        <p>Tivemos um problema processando seu pagamento.</p>
        <p><strong>Motivo:</strong> ${data.error_message ?? "não informado"}</p>
        ${storeUrl ? `<p><a href="${storeUrl}/minha-conta" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Tentar novamente</a></p>` : ""}
      `);
      return { subject, html };
    }
    case "cart_abandonment": {
      const items = Array.isArray(data.items) ? data.items : [];
      const itemsHtml = items.map((i: any) =>
        `<tr><td style="padding:6px 0;">${i.product_name ?? ""} ${i.dosage ? `(${i.dosage})` : ""} x${i.quantity ?? 1}</td><td style="text-align:right;">${brl((i.price ?? 0) * (i.quantity ?? 1))}</td></tr>`,
      ).join("");
      const cartUrl = storeUrl ? `${storeUrl}/carrinho` : "#";
      const subject = `${customer}, seus itens estão esperando por você!`;
      const html = wrap(storeName, `
        <p>Olá <strong>${customer}</strong>,</p>
        <p>Você deixou alguns itens no carrinho. Garanta antes que esgote!</p>
        <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
        <p style="text-align:right;font-weight:bold;">Total: ${brl(data.total_value)}</p>
        <p><a href="${cartUrl}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Finalizar minha compra</a></p>
      `);
      return { subject, html };
    }
    case "admin_notification": {
      const subject = data.subject ?? `Notificação interna — ${storeName}`;
      const html = wrap(storeName, `
        <p><strong>Evento:</strong> ${data.event ?? "—"}</p>
        <p>${data.message ?? ""}</p>
        ${data.details ? `<pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto;">${escapeHtml(JSON.stringify(data.details, null, 2))}</pre>` : ""}
      `, "Notificação automática enviada pelo sistema.");
      return { subject, html };
    }
    default:
      throw new Error(`Template desconhecido: ${template}`);
  }
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

    if (!isAuthorized) return json(401, { error: "Unauthorized" });

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
        "smtp_host",
        "smtp_port",
        "smtp_user",
        "smtp_pass",
        "smtp_from_email",
        "smtp_from_name",
        "smtp_secure", // "ssl" (465) | "tls" (587/STARTTLS)
        "store_public_url",
        "store_name",
        // Event toggles managed in /admin/eventos-email
        `email_event_${body.template}_enabled`,
        "email_admin_copy_enabled",
        "admin_notification_email",
        // Template overrides (one row per key)
        `email_template_${body.template}_subject`,
        `email_template_${body.template}_html`,
      ]);
    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => (cfg[s.key] = s.value));

    // ── Gating per event ───────────────────────────────────────────────
    // The admin can disable each transactional event individually from
    // /admin/eventos-email. Default is ENABLED (missing setting = "true").
    // "custom" and "admin_notification" are never gated — they're internal.
    const gatedEvents = new Set([
      "order_created",
      "order_paid",
      "shipping_update",
      "payment_failure",
      "cart_abandonment",
    ]);
    if (gatedEvents.has(body.template)) {
      const flag = (cfg[`email_event_${body.template}_enabled`] ?? "true").toLowerCase();
      if (flag === "false" || flag === "0" || flag === "off") {
        console.log(JSON.stringify({
          scope: "send-email",
          template: body.template,
          skipped: true,
          reason: "event_disabled_by_admin",
        }));
        return json(200, { success: true, skipped: true, reason: "event_disabled_by_admin" });
      }
    }

    // ── Admin copy ─────────────────────────────────────────────────────
    // When enabled, every customer-facing email gets an extra recipient:
    // the configured admin notification email. Skipped for admin-only
    // templates and "custom" sends.
    const adminCopyEnabled =
      (cfg["email_admin_copy_enabled"] ?? "false").toLowerCase() === "true";
    const adminCopyEmail = (cfg["admin_notification_email"] || "").trim();
    if (
      adminCopyEnabled &&
      adminCopyEmail &&
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminCopyEmail) &&
      body.template !== "admin_notification" &&
      body.template !== "custom" &&
      !recipients.includes(adminCopyEmail)
    ) {
      recipients.push(adminCopyEmail);
    }

    // ── SMTP config (Hostinger por padrão) ─────────────────────────────────
    const smtpHost = (cfg["smtp_host"] || Deno.env.get("SMTP_HOST") || "").trim();
    const smtpPort = parseInt(
      cfg["smtp_port"] || Deno.env.get("SMTP_PORT") || "465", 10,
    );
    const smtpUser = (cfg["smtp_user"] || Deno.env.get("SMTP_USER") || "").trim();
    const smtpPass = cfg["smtp_pass"] || Deno.env.get("SMTP_PASS") || "";
    const smtpFromEmail =
      (cfg["smtp_from_email"] || Deno.env.get("SMTP_FROM_EMAIL") || smtpUser).trim();
    const smtpFromName =
      (cfg["smtp_from_name"] || Deno.env.get("SMTP_FROM_NAME") || "").trim();
    const smtpSecure =
      (cfg["smtp_secure"] || Deno.env.get("SMTP_SECURE") || "").trim().toLowerCase();

    if (!smtpHost || !smtpUser || !smtpPass) {
      return json(500, {
        error:
          "SMTP não configurado. Defina smtp_host, smtp_user e smtp_pass em " +
          "Configurações → Comunicação (ou variáveis de ambiente SMTP_*).",
      });
    }

    const storeName = cfg["store_name"] || "Liberty Pharma";
    const storePublicUrl = (cfg["store_public_url"] || "").replace(/\/+$/, "");

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
    let messageId: string | null = null;
    let providerErr: string | null = null;
    let providerStatus = 0;
    let ok = false;

    // Decide TLS por porta + override explícito (smtp_secure="ssl"|"tls").
    // Hostinger: 465 = SSL implícito; 587 = STARTTLS.
    const useSsl = smtpSecure === "ssl" || smtpPort === 465;
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: useSsl,
        auth: { username: smtpUser, password: smtpPass },
      },
      pool: false,
    });

    try {
      const fromHeader = smtpFromName
        ? `${smtpFromName} <${smtpFromEmail || smtpUser}>`
        : `${storeName} <${smtpFromEmail || smtpUser}>`;
      await client.send({
        from: fromHeader,
        to: recipients,
        replyTo: smtpFromEmail || smtpUser,
        subject: rendered.subject,
        content: "auto",
        html: rendered.html,
      });
      await client.close();
      providerStatus = 250;
      messageId = `smtp-${crypto.randomUUID()}`;
      ok = true;
    } catch (e) {
      providerErr = e instanceof Error ? e.message : String(e);
      try { await client.close(); } catch (_) { /* noop */ }
      // Mascara qualquer eco de senha em mensagem de erro.
      if (smtpPass && providerErr) {
        providerErr = providerErr.split(smtpPass).join("***");
      }
      console.warn(`send-email: SMTP falhou (${smtpHost}:${smtpPort}) — ${providerErr}`);
    }

    const latency = Date.now() - sendStart;
    const usedFrom = smtpFromEmail || smtpUser;

    // Persist a row per recipient in email_send_log (best-effort).
    const logRows = recipients.map((r) => ({
      message_id: messageId,
      template_name: body.template,
      recipient_email: r,
      subject: rendered.subject,
      status: ok ? "sent" : "failed",
      error_message: ok ? null : providerErr,
      provider_response: null,
      metadata: {
        provider: "smtp",
        from_used: usedFrom,
        latency_ms: latency,
        provider_status: providerStatus,
      },
    }));
    admin.from("email_send_log").insert(logRows).then(({ error }) => {
      if (error) console.error("email_send_log insert error:", error.message);
    });

    if (!ok) {
      console.error(JSON.stringify({
        scope: "send-email",
        template: body.template,
        to_count: recipients.length,
        provider: "smtp",
        from_used: usedFrom,
        provider_status: providerStatus,
        provider_error: providerErr,
        latency_ms: latency,
      }));
      return json(502, {
        error: providerErr || "SMTP falhou ao enviar",
        provider: "smtp",
        provider_status: providerStatus,
      });
    }

    console.log(JSON.stringify({
      scope: "send-email",
      template: body.template,
      to_count: recipients.length,
      provider: "smtp",
      from_used: usedFrom,
      latency_ms: latency,
      message_id: messageId,
    }));

    return json(200, {
      success: true,
      provider: "smtp",
      message_id: messageId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-email fatal:", msg);
    return json(500, { error: msg });
  }
});
