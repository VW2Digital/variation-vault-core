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
      'whatsapp_number',
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

  // ── Email notification (delegated to send-email / SMTP Hostinger) ──
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const adminEmail = cfg['admin_notification_email'] || cfg['smtp_from_email'] || '';
  const callSendEmail = async (to: string, subject: string, isAdmin: boolean) => {
    if (!supabaseUrl || !serviceRoleKey || !to) return;
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          template: isAdmin ? 'admin_notification' : (isApproved ? 'order_paid' : 'payment_failure'),
          to,
          subject,
          data: isAdmin ? {
            event: `Pagamento ${statusLabel}`,
            message: `Atualização de pagamento (após análise) — pedido ${data.orderId}`,
            details: {
              cliente: data.customerName, email: data.customerEmail, telefone: data.customerPhone,
              produto: data.productName, valor: valueFormatted, metodo: method,
              pedido: data.orderId, horario: now,
            },
          } : {
            customer_name: data.customerName, order_id: data.orderId,
            product_name: data.productName, total_value: data.totalValue,
            payment_method: method,
            error_message: isApproved ? undefined : 'Pagamento não aprovado pela operadora.',
          },
        }),
      });
      console.log(`[Pagar.me Webhook] send-email ${isAdmin ? 'admin' : 'customer'}: ${r.status}`);
    } catch (e: any) {
      console.error(`[Pagar.me Webhook] send-email error: ${e.message}`);
    }
  };

  if (adminEmail) {
    await callSendEmail(adminEmail, `Pagamento ${statusLabel} - ${data.customerName || 'Cliente'} - ${valueFormatted}`, true);
  }
  if (notifyCustomer && data.customerEmail) {
    await callSendEmail(
      data.customerEmail,
      isApproved ? `Pagamento Aprovado - ${data.productName}` : `Pagamento Não Aprovado - ${data.productName}`,
      false,
    );
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const __startTs = Date.now();
  let __logCtx: any = {
    gateway: 'pagarme', event_type: null, http_status: 200,
    signature_valid: null, signature_error: null, order_id: null,
    external_id: null, error_message: null, request_payload: null,
  };
  let __logged = false;
  const __writeLog = async () => {
    if (__logged) return;
    __logged = true;
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('webhook_logs').insert({ ...__logCtx, latency_ms: Date.now() - __startTs });
    } catch {}
  };

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
    __logCtx.signature_valid = valid;
    if (!valid) {
      __logCtx.signature_error = 'HMAC-SHA1 mismatch or missing X-Hub-Signature header';
      try { __logCtx.request_payload = JSON.parse(bodyText); } catch { __logCtx.request_payload = { raw: bodyText.slice(0, 500) }; }
      await __writeLog();
      return new Response(JSON.stringify({ received: true, error: 'invalid_signature' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(bodyText);
    __logCtx.request_payload = event;
    const eventType = event?.type || '';
    __logCtx.event_type = eventType;
    __logCtx.external_id = event?.data?.id || null;
    const data = event?.data || {};
    console.log(`[Pagar.me Webhook] Event: ${eventType}, Order ID: ${data?.id}`);

    // Find order by code (our internal orderId) or by id
    const orderCode = data?.code; // our internal orderId
    if (orderCode) __logCtx.order_id = orderCode;
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

        // Increment coupon usage on first transition to PAID
        if (newStatus === 'PAID' && previousStatus !== 'PAID') {
          try {
            const { data: orderForCoupon } = await supabase
              .from('orders')
              .select('coupon_code')
              .eq('id', orderCode)
              .maybeSingle();
            if (orderForCoupon?.coupon_code) {
              await supabase.rpc('increment_coupon_usage', { _coupon_code: orderForCoupon.coupon_code });
              console.log(`[Pagar.me Webhook] Coupon usage incremented for: ${orderForCoupon.coupon_code}`);
            }
          } catch (couponErr: any) {
            console.error('[Pagar.me Webhook] Coupon increment error:', couponErr?.message);
          }
        }

        // Send notifications on terminal status (PAID/REFUSED).
        // Uses email_send_log as idempotency guard to avoid duplicates when
        // multiple webhooks (charge.paid, antifraud_approved) arrive for the
        // same order or when the order was already marked PAID synchronously
        // by the checkout flow before the webhook landed.
        if (newStatus === 'PAID' || newStatus === 'REFUSED') {
          const templateName = newStatus === 'PAID' ? 'order_paid' : 'payment_failure';
          let alreadySent = false;
          try {
            const { data: prevSends } = await supabase
              .from('email_send_log')
              .select('id')
              .eq('recipient_email', existing.customer_email || '')
              .eq('template_name', templateName)
              .eq('status', 'sent')
              .contains('metadata', { order_id: orderCode })
              .limit(1);
            alreadySent = Array.isArray(prevSends) && prevSends.length > 0;
          } catch (idemErr: any) {
            // Idempotency check is best-effort; on failure we still send.
            console.warn('[Pagar.me Webhook] Idempotency check failed:', idemErr?.message);
          }

          if (!alreadySent) {
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
          } else {
            console.log(`[Pagar.me Webhook] Notification already sent for order ${orderCode} (${templateName}), skipping.`);
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
    __logCtx.error_message = e.message;
    return new Response(JSON.stringify({ received: true, error: e.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await __writeLog();
  }
});
