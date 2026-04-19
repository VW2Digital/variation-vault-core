import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature',
};

// HMAC-SHA1 validation per Pagar.me v5 docs (X-Hub-Signature: sha1=<hex>)
async function verifySignature(req: Request, body: string, secret: string): Promise<boolean> {
  if (!secret) {
    console.warn('[Pagar.me Webhook] No secret configured — skipping verification');
    return true;
  }
  const header = req.headers.get('x-hub-signature') || req.headers.get('X-Hub-Signature') || '';
  if (!header) {
    console.warn('[Pagar.me Webhook] Missing X-Hub-Signature header');
    return false;
  }
  const provided = header.startsWith('sha1=') ? header.slice(5) : header;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  if (computed !== provided) {
    console.error(`[Pagar.me Webhook] Signature mismatch. Got: ${provided.slice(0, 12)}... Expected: ${computed.slice(0, 12)}...`);
    return false;
  }
  return true;
}

function mapStatus(s: string): string {
  const map: Record<string, string> = {
    paid: 'PAID',
    pending: 'PENDING',
    processing: 'PENDING',
    authorized_pending_capture: 'PENDING',
    waiting_capture: 'PENDING',
    not_authorized: 'REFUSED',
    failed: 'REFUSED',
    canceled: 'CANCELLED',
    refunded: 'REFUNDED',
    chargedback: 'CHARGEBACK',
    with_error: 'REFUSED',
  };
  return map[s] || 'PENDING';
}

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 1, IN_REVIEW: 2, AWAITING_RISK_ANALYSIS: 2, OVERDUE: 3,
  REFUSED: 5, REPROVED: 5, CANCELLED: 6,
  PAID: 10, CONFIRMED: 10, RECEIVED: 10,
  REFUNDED: 11, CHARGEBACK: 12,
};

interface NotificationData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  productName: string;
  totalValue: number;
  paymentMethod: string;
  newStatus: string;
}

async function sendPaymentNotification(supabase: any, data: NotificationData) {
  const { data: settings } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', [
      'evolution_api_url', 'evolution_api_key', 'evolution_instance_name',
      'whatsapp_number', 'resend_api_key', 'resend_from_email',
      'notify_customer_on_payment',
    ]);

  const cfg: Record<string, string> = {};
  for (const s of settings || []) cfg[s.key] = s.value;

  const notifyCustomer = cfg['notify_customer_on_payment'] !== 'false'; // default true

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const valueFormatted = Number(data.totalValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const isApproved = data.newStatus === 'PAID';
  const statusEmoji = isApproved ? '✅' : '❌';
  const statusLabel = isApproved ? 'APROVADO' : 'RECUSADO';
  const method = data.paymentMethod === 'credit_card' ? 'Cartão de Crédito' : 'PIX';

  // ── WhatsApp ──
  const apiUrl = cfg['evolution_api_url'];
  const apiKey = cfg['evolution_api_key'];
  const instanceName = cfg['evolution_instance_name'];
  const adminWhatsapp = cfg['whatsapp_number'];

  if (apiUrl && apiKey && instanceName && adminWhatsapp) {
    try {
      const baseUrl = apiUrl.replace(/\/+$/, '');
      const adminText = [
        `${statusEmoji} *Pagamento ${statusLabel}* (Pagar.me)`,
        ``,
        `👤 *Cliente:* ${data.customerName || 'N/A'}`,
        `📧 *Email:* ${data.customerEmail || 'N/A'}`,
        `📱 *Telefone:* ${data.customerPhone || 'N/A'}`,
        ``,
        `🛒 *Produto:* ${data.productName || 'N/A'}`,
        `💰 *Valor:* ${valueFormatted}`,
        `💳 *Método:* ${method}`,
        `🆔 *Pedido:* ${data.orderId}`,
        `🕐 *Horário:* ${now}`,
      ].join('\n');

      const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ number: adminWhatsapp.replace(/\D/g, ''), text: adminText }),
      });
      console.log(`[Pagar.me Webhook] Admin WhatsApp: ${res.ok ? 'sent' : `error:${res.status}`}`);
    } catch (e: any) {
      console.error(`[Pagar.me Webhook] Admin WhatsApp error: ${e.message}`);
    }

    if (notifyCustomer && data.customerPhone) {
      try {
        const baseUrl = apiUrl.replace(/\/+$/, '');
        const customerPhone = data.customerPhone.replace(/\D/g, '');
        const phoneWithCountry = customerPhone.startsWith('55') ? customerPhone : `55${customerPhone}`;

        const customerText = isApproved
          ? [
              `✅ *Pagamento Aprovado!*`,
              ``,
              `Olá ${data.customerName?.split(' ')[0] || 'Cliente'}! 🎉`,
              ``,
              `Seu pagamento de ${valueFormatted} para o pedido "${data.productName}" foi *aprovado*!`,
              ``,
              `Agora vamos preparar seu pedido para envio. Você receberá o código de rastreio em breve.`,
              ``,
              `Obrigado por comprar conosco! 💚`,
            ].join('\n')
          : [
              `❌ *Pagamento Não Aprovado*`,
              ``,
              `Olá ${data.customerName?.split(' ')[0] || 'Cliente'},`,
              ``,
              `Infelizmente, seu pagamento de ${valueFormatted} para "${data.productName}" não foi aprovado pela operadora do cartão.`,
              ``,
              `Você pode tentar novamente com outro cartão ou pagar via PIX para aprovação imediata.`,
              ``,
              `Se precisar de ajuda, estamos à disposição! 🤝`,
            ].join('\n');

        const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
          body: JSON.stringify({ number: phoneWithCountry, text: customerText }),
        });
        console.log(`[Pagar.me Webhook] Customer WhatsApp: ${res.ok ? 'sent' : `error:${res.status}`}`);
      } catch (e: any) {
        console.error(`[Pagar.me Webhook] Customer WhatsApp error: ${e.message}`);
      }
    }
  }

  // ── Email ──
  const resendKey = cfg['resend_api_key'] || Deno.env.get('RESEND_API_KEY');
  const fromEmail = cfg['resend_from_email'];

  if (resendKey && fromEmail) {
    try {
      const adminHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:${isApproved ? '#38a169' : '#e53e3e'};">${statusEmoji} Pagamento ${statusLabel} (Pagar.me)</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Cliente</td><td style="padding:8px;border-bottom:1px solid #eee;">${data.customerName || 'N/A'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${data.customerEmail || 'N/A'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Telefone</td><td style="padding:8px;border-bottom:1px solid #eee;">${data.customerPhone || 'N/A'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Produto</td><td style="padding:8px;border-bottom:1px solid #eee;">${data.productName || 'N/A'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Valor</td><td style="padding:8px;border-bottom:1px solid #eee;">${valueFormatted}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Método</td><td style="padding:8px;border-bottom:1px solid #eee;">${method}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Pedido</td><td style="padding:8px;">${data.orderId}</td></tr>
          </table>
          <p style="color:#666;font-size:12px;margin-top:16px;">Horário: ${now}</p>
        </div>
      `;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: `Liberty Pharma <${fromEmail}>`,
          to: [fromEmail],
          subject: `${statusEmoji} Pagamento ${statusLabel} (Pagar.me) - ${data.customerName || 'Cliente'} - ${valueFormatted}`,
          html: adminHtml,
        }),
      });
      console.log(`[Pagar.me Webhook] Admin email: ${res.ok ? 'sent' : `error:${res.status}`}`);
    } catch (e: any) {
      console.error(`[Pagar.me Webhook] Admin email error: ${e.message}`);
    }

    if (notifyCustomer && data.customerEmail) {
      try {
        const customerHtml = isApproved
          ? `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#38a169;">✅ Pagamento Aprovado!</h2>
              <p>Olá ${data.customerName?.split(' ')[0] || 'Cliente'},</p>
              <p>Seu pagamento de <strong>${valueFormatted}</strong> para o pedido <strong>"${data.productName}"</strong> foi <strong>aprovado</strong>!</p>
              <p>Agora vamos preparar seu pedido para envio. Você receberá o código de rastreio em breve.</p>
              <p>Obrigado por comprar conosco! 💚</p>
            </div>
          `
          : `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#e53e3e;">Pagamento Não Aprovado</h2>
              <p>Olá ${data.customerName?.split(' ')[0] || 'Cliente'},</p>
              <p>Infelizmente, seu pagamento de <strong>${valueFormatted}</strong> para <strong>"${data.productName}"</strong> não foi aprovado pela operadora do cartão.</p>
              <p>Você pode tentar novamente com outro cartão ou pagar via PIX para aprovação imediata.</p>
              <p>Se precisar de ajuda, estamos à disposição!</p>
            </div>
          `;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: `Liberty Pharma <${fromEmail}>`,
            to: [data.customerEmail],
            subject: isApproved
              ? `✅ Pagamento Aprovado - ${data.productName}`
              : `Pagamento Não Aprovado - ${data.productName}`,
            html: customerHtml,
          }),
        });
        console.log(`[Pagar.me Webhook] Customer email: ${res.ok ? 'sent' : `error:${res.status}`}`);
      } catch (e: any) {
        console.error(`[Pagar.me Webhook] Customer email error: ${e.message}`);
      }
    }
  }

  console.log(`[Pagar.me Webhook] Notifications sent for ${data.orderId}: ${statusLabel}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const bodyText = await req.text();

    // Read webhook secret
    const { data: secretRow } = await supabase
      .from('site_settings').select('value').eq('key', 'pagarme_webhook_secret').maybeSingle();
    const secret = secretRow?.value || '';

    const valid = await verifySignature(req, bodyText, secret);
    if (!valid) {
      return new Response(JSON.stringify({ received: true, error: 'invalid_signature' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(bodyText);
    const eventType = event?.type || '';
    const data = event?.data || {};
    console.log(`[Pagar.me Webhook] Event: ${eventType}, Order ID: ${data?.id}`);

    // Find order by code (our internal orderId) or by id
    const orderCode = data?.code; // our internal orderId
    const charges = Array.isArray(data?.charges) ? data.charges : [];
    const lastCharge = charges[charges.length - 1] || {};
    const newStatus = mapStatus(lastCharge.status || data?.status || 'pending');

    if (!orderCode) {
      console.warn('[Pagar.me Webhook] No order code in payload');
      return new Response(JSON.stringify({ received: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Lookup order
    const { data: existing } = await supabase
      .from('orders')
      .select('id, status, customer_name, customer_email, customer_phone, product_name, total_value, payment_method')
      .eq('id', orderCode)
      .maybeSingle();

    if (!existing) {
      console.warn(`[Pagar.me Webhook] Order not found: ${orderCode}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const previousStatus = existing.status;
    const currentPriority = STATUS_PRIORITY[previousStatus] ?? 0;
    const newPriority = STATUS_PRIORITY[newStatus] ?? 1;

    if (newPriority > currentPriority || previousStatus === newStatus) {
      const { error: updErr } = await supabase
        .from('orders')
        .update({ status: newStatus, asaas_payment_id: data.id })
        .eq('id', orderCode);
      if (updErr) {
        console.error('[Pagar.me Webhook] DB update error:', updErr.message);
      } else {
        console.log(`[Pagar.me Webhook] Order ${orderCode}: ${previousStatus} -> ${newStatus}`);

        // Send notifications on terminal status transitions only
        const statusChanged = previousStatus !== newStatus;
        if (statusChanged && (newStatus === 'PAID' || newStatus === 'REFUSED')) {
          try {
            await sendPaymentNotification(supabase, {
              orderId: orderCode,
              customerName: existing.customer_name || '',
              customerEmail: existing.customer_email || '',
              customerPhone: existing.customer_phone,
              productName: existing.product_name || '',
              totalValue: Number(existing.total_value) || 0,
              paymentMethod: existing.payment_method || 'credit_card',
              newStatus,
            });
          } catch (notifErr: any) {
            console.error('[Pagar.me Webhook] Notification error:', notifErr.message);
          }
        }
      }
    } else {
      console.log(`[Pagar.me Webhook] Skipped regression: ${previousStatus} -> ${newStatus}`);
    }

    return new Response(JSON.stringify({ received: true, status: newStatus }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[Pagar.me Webhook] Error:', e.message);
    return new Response(JSON.stringify({ received: true, error: e.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
