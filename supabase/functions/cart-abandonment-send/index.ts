import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CartItemPayload {
  product_name: string;
  dosage?: string;
  quantity: number;
  price: number;
}

interface SendPayload {
  user_id: string;
  email?: string;
  full_name?: string;
  items: CartItemPayload[];
  total_value: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = claimsData.claims.sub;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = (await req.json()) as SendPayload;
    if (!payload?.user_id || !Array.isArray(payload.items) || payload.items.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Respect user opt-out for email marketing
    const { data: pref } = await admin
      .from('contact_preferences')
      .select('allow_email_marketing')
      .eq('user_id', payload.user_id)
      .maybeSingle();
    if (pref && pref.allow_email_marketing === false) {
      return new Response(JSON.stringify({
        error: 'Cliente optou por não receber emails de marketing.',
        opted_out: true,
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve recipient email if not provided
    let recipient = payload.email || '';
    let recipientName = payload.full_name || 'Cliente';
    if (!recipient) {
      const { data: { user } } = await admin.auth.admin.getUserById(payload.user_id);
      recipient = user?.email || '';
    }
    if (!recipient) {
      return new Response(JSON.stringify({ error: 'Cliente sem email cadastrado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load Resend settings + store url
    const { data: settings } = await admin
      .from('site_settings')
      .select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email', 'store_public_url']);

    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => { cfg[s.key] = s.value; });

    const resendApiKey = cfg['resend_api_key'] || Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Resend API key não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const configuredFrom = cfg['resend_from_email'] || '';
    const PUBLIC_DOMAINS = ['gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','yahoo.com','yahoo.com.br','icloud.com','msn.com','bol.com.br','uol.com.br','terra.com.br'];
    const fromDomain = configuredFrom.split('@')[1]?.toLowerCase() || '';
    const isPublicDomain = PUBLIC_DOMAINS.includes(fromDomain);
    const fromEmail = isPublicDomain || !configuredFrom ? 'onboarding@resend.dev' : configuredFrom;
    const replyToEmail = configuredFrom && configuredFrom.includes('@') ? configuredFrom : undefined;
    const storePublicUrl = (cfg['store_public_url'] || '').replace(/\/+$/, '');
    const cartUrl = storePublicUrl ? `${storePublicUrl}/carrinho` : '#';

    const itemsHtml = payload.items.map(i => `
      <tr>
        <td style="padding:8px 0;color:#333;font-size:14px;">
          ${i.product_name}${i.dosage ? ` <span style="color:#888;">(${i.dosage})</span>` : ''}
          <span style="color:#888;"> x${i.quantity}</span>
        </td>
        <td style="padding:8px 0;color:#333;font-size:14px;text-align:right;font-weight:600;">
          R$ ${(i.price * i.quantity).toFixed(2).replace('.', ',')}
        </td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background:#ffffff;">
        <h2 style="color:#1a1a2e;margin:0 0 12px;">Olá, ${recipientName}! 👋</h2>
        <p style="color:#333;font-size:16px;line-height:1.5;margin:0 0 20px;">
          Notamos que você deixou alguns itens no seu carrinho. Não perca a oportunidade de garantir seus produtos!
        </p>
        <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:0 0 24px;">
          <h3 style="color:#1a1a2e;margin:0 0 12px;font-size:16px;">Seus itens aguardam por você:</h3>
          <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:14px 0;" />
          <div style="display:flex;justify-content:space-between;color:#1a1a2e;font-weight:bold;font-size:16px;">
            <span>Total</span>
            <span style="float:right;">R$ ${payload.total_value.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>
        <a href="${cartUrl}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:16px;">
          Finalizar minha compra →
        </a>
        <p style="color:#999;font-size:12px;margin-top:30px;">
          Se você já finalizou sua compra, por favor ignore este e-mail.
        </p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Liberty Pharma <${fromEmail}>`,
        to: recipient,
        ...(replyToEmail ? { reply_to: replyToEmail } : {}),
        subject: `${recipientName}, seus itens estão esperando por você! 🛒`,
        html,
      }),
    });

    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({ error: resBody?.message || 'Falha ao enviar email', detail: resBody }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log delivery
    await admin.from('cart_abandonment_logs').insert({
      user_id: payload.user_id,
      cart_item_count: payload.items.length,
    });

    return new Response(JSON.stringify({ success: true, fallback: isPublicDomain, to: recipient }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('cart-abandonment-send error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});