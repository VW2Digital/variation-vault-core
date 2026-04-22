import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PUBLIC_DOMAINS = ['gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','yahoo.com','yahoo.com.br','icloud.com','msn.com','bol.com.br','uol.com.br','terra.com.br'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { to, subject, message } = body as { to?: string; subject?: string; message?: string };

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return new Response(JSON.stringify({ error: 'Email destinatário inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email']);

    const cfg: Record<string, string> = {};
    for (const s of settings || []) cfg[s.key] = s.value;

    const resendKey = cfg['resend_api_key'];
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'API Key do Resend não configurada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const configuredFrom = cfg['resend_from_email'] || '';
    const fromDomain = configuredFrom.split('@')[1]?.toLowerCase() || '';
    const isPublicDomain = PUBLIC_DOMAINS.includes(fromDomain);
    const fromEmail = isPublicDomain || !configuredFrom ? 'onboarding@resend.dev' : configuredFrom;
    const replyToEmail = configuredFrom && configuredFrom.includes('@') ? configuredFrom : undefined;

    const finalSubject = subject?.trim() || '✅ Teste de envio - Resend';
    const finalMessage = message?.trim() || 'Este é um e-mail de teste enviado pelo painel administrativo. Se você está vendo esta mensagem, sua integração com o Resend está funcionando corretamente.';

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
          <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:#0f172a;color:#fff;padding:24px 28px;">
              <h1 style="margin:0;font-size:20px;">${finalSubject}</h1>
            </div>
            <div style="padding:28px;line-height:1.6;font-size:15px;">
              <p style="margin:0 0 16px;">${finalMessage.replace(/\n/g, '<br/>')}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
              <p style="margin:0;font-size:12px;color:#6b7280;">
                Enviado de: <strong>${fromEmail}</strong><br/>
                ${replyToEmail && replyToEmail !== fromEmail ? `Reply-To: <strong>${replyToEmail}</strong><br/>` : ''}
                Horário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const payload: Record<string, unknown> = {
      from: fromEmail,
      to: [to],
      subject: finalSubject,
      html,
    };
    if (replyToEmail && replyToEmail !== fromEmail) {
      payload.reply_to = replyToEmail;
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await resendRes.text();
    let parsed: any = null;
    try { parsed = JSON.parse(responseText); } catch { /* ignore */ }

    if (!resendRes.ok) {
      const errMsg = parsed?.message || parsed?.error || responseText || `HTTP ${resendRes.status}`;
      return new Response(JSON.stringify({
        error: errMsg,
        status: resendRes.status,
        details: parsed,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      id: parsed?.id,
      from: fromEmail,
      to,
      replyTo: replyToEmail || null,
      usedFallback: isPublicDomain,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});