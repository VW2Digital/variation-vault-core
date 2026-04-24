// Centralized transactional email dispatcher.
// Uses SMTP (Hostinger ou qualquer SMTP) como ÚNICO provider.
// Não há fallback Resend — o projeto removeu qualquer dependência da
// Resend API. Para alta entregabilidade, configure SPF/DKIM/DMARC do
// domínio do remetente.
//
// Esta função delega:
//   - autorização → _shared/auth.ts
//   - logs estruturados c/ correlation id → _shared/logger.ts
//   - envio SMTP + classificação de erros → _shared/email-provider.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorrelationId, json, preflight } from "../_shared/http.ts";
import { createLogger } from "../_shared/logger.ts";
import { authorizeAdminOrServiceRole } from "../_shared/auth.ts";
import { createSmtpProvider } from "../_shared/email-provider.ts";
import { maskSecretInMessage } from "../_shared/email-errors.ts";

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
    case "plan_expiring": {
      const days = Number(data.days_remaining ?? 0);
      const planName = data.plan_name ?? "seu plano";
      const expiresAt = data.expires_at
        ? new Date(String(data.expires_at)).toLocaleDateString("pt-BR")
        : "—";
      const renewUrl = data.renew_url || (storeUrl ? `${storeUrl}/minha-conta` : "");
      const subject =
        days <= 0
          ? `Seu plano expirou — renove agora`
          : `Seu plano expira em ${days} dia${days === 1 ? "" : "s"}`;
      const html = wrap(storeName, `
        <p>Olá <strong>${customer}</strong>,</p>
        <p>Seu plano <strong>${planName}</strong> ${
          days <= 0
            ? `<strong style="color:#b91c1c;">expirou em ${expiresAt}</strong>.`
            : `está prestes a expirar em <strong>${expiresAt}</strong> (${days} dia${days === 1 ? "" : "s"} restante${days === 1 ? "" : "s"}).`
        }</p>
        <p>Para evitar interrupção do serviço, renove agora mesmo.</p>
        ${renewUrl ? `<p><a href="${renewUrl}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">Renovar plano</a></p>` : ""}
      `);
      return { subject, html };
    }
    default:
      throw new Error(`Template desconhecido: ${template}`);
  }
}

serve(async (req) => {
  const correlationId = getCorrelationId(req);
  const pre = preflight(req, correlationId);
  if (pre) return pre;

  const log = createLogger({ scope: "send-email", correlationId });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authz = await authorizeAdminOrServiceRole(req);
    if (!authz.authorized) {
      log.warn("unauthorized", { caller: authz.caller });
      return json(401, { error: "Unauthorized", correlation_id: correlationId }, correlationId);
    }

    const body = (await req.json()) as SendEmailRequest;
    if (!body?.template || !body?.to) {
      return json(400, { error: "Campos obrigatórios: template, to", correlation_id: correlationId }, correlationId);
    }
    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    if (recipients.some((r) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r))) {
      return json(400, { error: "Email destinatário inválido", correlation_id: correlationId }, correlationId);
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
      "plan_expiring",
    ]);
    if (gatedEvents.has(body.template)) {
      const flag = (cfg[`email_event_${body.template}_enabled`] ?? "true").toLowerCase();
      if (flag === "false" || flag === "0" || flag === "off") {
        log.info("event_disabled_by_admin", { template: body.template });
        return json(200, {
          success: true,
          skipped: true,
          reason: "event_disabled_by_admin",
          correlation_id: correlationId,
        }, correlationId);
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
      log.error("smtp_not_configured", {
        has_host: Boolean(smtpHost),
        has_user: Boolean(smtpUser),
        has_pass: Boolean(smtpPass),
      });
      return json(500, {
        error:
          "SMTP não configurado. Defina smtp_host, smtp_user e smtp_pass em " +
          "Configurações → Comunicação (ou variáveis de ambiente SMTP_*).",
        correlation_id: correlationId,
      }, correlationId);
    }

    const storeName = cfg["store_name"] || "Liberty Pharma";
    // Fallback chain para garantir que botões nos emails sempre tenham link
    // absoluto. Sem isso, href="/carrinho" não abre quando clicado de dentro
    // do cliente de email (Gmail, Outlook, etc.).
    const storePublicUrl = (
      cfg["store_public_url"] ||
      Deno.env.get("PUBLIC_SITE_URL") ||
      Deno.env.get("SITE_URL") ||
      ""
    ).replace(/\/+$/, "");
    if (!storePublicUrl) {
      log.warn("store_public_url_not_configured", {
        hint: "Defina 'URL pública do site' em Configurações → Avançado para que os links nos emails funcionem.",
      });
    }

    let rendered: { subject: string; html: string };
    if (body.template === "custom") {
      if (!body.html && !body.text) {
        return json(400, { error: "custom requer html ou text", correlation_id: correlationId }, correlationId);
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

    const usedFrom = smtpFromEmail || smtpUser;
    const fromHeader = smtpFromName
      ? `${smtpFromName} <${usedFrom}>`
      : `${storeName} <${usedFrom}>`;

    const provider = createSmtpProvider({
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      secure: smtpSecure,
    });

    const childLog = log.child({
      template: body.template,
      to_count: recipients.length,
      from_used: usedFrom,
    });

    const result = await provider.send({
      from: fromHeader,
      to: recipients,
      replyTo: usedFrom,
      subject: rendered.subject,
      html: rendered.html,
      correlationId,
    }, childLog);

    // Persist one row per recipient in email_send_log (best-effort, fire-and-forget).
    const logRows = recipients.map((r) => ({
      message_id: result.message_id,
      template_name: body.template,
      recipient_email: r,
      subject: rendered.subject,
      status: result.ok ? "sent" : "failed",
      error_message: result.ok ? null : maskSecretInMessage(result.raw_error, smtpPass),
      provider_response: null,
      metadata: {
        provider: result.provider,
        from_used: usedFrom,
        latency_ms: result.latency_ms,
        provider_status: result.provider_status,
        correlation_id: correlationId,
        ...(result.ok ? {} : {
          error_category: result.error.category,
          retryable: result.error.retryable,
          smtp_code: result.error.smtp_code,
        }),
      },
    }));
    admin.from("email_send_log").insert(logRows).then(({ error }) => {
      if (error) childLog.error("email_send_log_insert_failed", { error: error.message });
    });

    if (!result.ok) {
      return json(502, {
        error: result.error.friendly,
        error_category: result.error.category,
        retryable: result.error.retryable,
        provider: result.provider,
        provider_status: result.provider_status,
        message_id: result.message_id,
        correlation_id: correlationId,
      }, correlationId);
    }

    return json(200, {
      success: true,
      provider: result.provider,
      message_id: result.message_id,
      correlation_id: correlationId,
    }, correlationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("fatal", { error: msg });
    return json(500, { error: msg, correlation_id: correlationId }, correlationId);
  }
});
