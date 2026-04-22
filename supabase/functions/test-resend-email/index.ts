// Test SMTP email — envia um email de teste usando as credenciais SMTP
// configuradas em site_settings (Hostinger por padrão).
// (O nome da função foi mantido como "test-resend-email" para evitar
// quebras de deploy/URL; internamente é apenas um teste SMTP.)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { to, subject, message } = body as { to?: string; subject?: string; message?: string };

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return new Response(JSON.stringify({ error: "Email destinatário inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "smtp_host", "smtp_port", "smtp_user", "smtp_pass",
        "smtp_from_email", "smtp_from_name", "smtp_secure",
        "store_name",
      ]);
    const cfg: Record<string, string> = {};
    for (const s of settings || []) cfg[s.key] = s.value;

    const smtpHost = (cfg["smtp_host"] || Deno.env.get("SMTP_HOST") || "").trim();
    const smtpPort = parseInt(cfg["smtp_port"] || Deno.env.get("SMTP_PORT") || "465", 10);
    const smtpUser = (cfg["smtp_user"] || Deno.env.get("SMTP_USER") || "").trim();
    const smtpPass = cfg["smtp_pass"] || Deno.env.get("SMTP_PASS") || "";
    const smtpFromEmail = (cfg["smtp_from_email"] || Deno.env.get("SMTP_FROM_EMAIL") || smtpUser).trim();
    const smtpFromName = (cfg["smtp_from_name"] || Deno.env.get("SMTP_FROM_NAME") || "").trim();
    const smtpSecure = (cfg["smtp_secure"] || Deno.env.get("SMTP_SECURE") || "").trim().toLowerCase();
    const storeName = cfg["store_name"] || "Liberty Pharma";

    if (!smtpHost || !smtpUser || !smtpPass) {
      return new Response(JSON.stringify({
        error: "SMTP não configurado. Defina smtp_host, smtp_user e smtp_pass em Configurações → Comunicação.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const finalSubject = subject?.trim() || "Teste de envio - SMTP Hostinger";
    const finalMessage = message?.trim() || "Este é um e-mail de teste enviado pelo painel administrativo. Se você está vendo esta mensagem, sua integração SMTP está funcionando corretamente.";

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
          <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:#0f172a;color:#fff;padding:24px 28px;">
              <h1 style="margin:0;font-size:20px;">${finalSubject}</h1>
            </div>
            <div style="padding:28px;line-height:1.6;font-size:15px;">
              <p style="margin:0 0 16px;">${finalMessage.replace(/\n/g, "<br/>")}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
              <p style="margin:0;font-size:12px;color:#6b7280;">
                Enviado de: <strong>${smtpFromEmail || smtpUser}</strong><br/>
                Servidor: <strong>${smtpHost}:${smtpPort}</strong><br/>
                Horário: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

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
        to: [to],
        subject: finalSubject,
        content: "auto",
        html,
      });
      await client.close();
      return new Response(JSON.stringify({
        success: true,
        provider: "smtp",
        from: smtpFromEmail || smtpUser,
        to,
        host: smtpHost,
        port: smtpPort,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e: any) {
      try { await client.close(); } catch (_) { /* noop */ }
      let msg = e?.message || String(e);
      if (smtpPass && msg) msg = msg.split(smtpPass).join("***");
      return new Response(JSON.stringify({
        error: msg,
        host: smtpHost,
        port: smtpPort,
        secure: useSsl ? "ssl" : "starttls",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
