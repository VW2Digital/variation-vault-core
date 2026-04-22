import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function verifyWebhookSignature(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (!secret) {
    console.warn('[MP Webhook] MP_WEBHOOK_SECRET not set — skipping signature verification');
    return true; // allow through if not configured
  }

  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');

  if (!xSignature || !xRequestId) {
    console.warn('[MP Webhook] Missing x-signature or x-request-id headers');
    return false;
  }

  // Parse x-signature: "ts=...,v1=..."
  const parts: Record<string, string> = {};
  xSignature.split(',').forEach((part) => {
    const [key, value] = part.trim().split('=');
    if (key && value) parts[key] = value;
  });

  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) {
    console.warn('[MP Webhook] Invalid x-signature format');
    return false;
  }

  // Extract data.id from the query string (MP sends it as ?data.id=xxx)
  const url = new URL(req.url);
  const dataId = url.searchParams.get('data.id') || '';

  // Build the manifest: id:{data.id};request-id:{x-request-id};ts:{ts};
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  // HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const computed = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computed !== v1) {
    console.error(`[MP Webhook] Signature mismatch. Expected: ${v1}, Got: ${computed}`);
    return false;
  }

  console.log('[MP Webhook] Signature verified successfully');
  return true;
}

interface ReviewNotificationData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  productName: string;
  totalValue: number;
  paymentMethod: string;
  newStatus: string;
}

async function sendReviewResultNotification(supabase: any, data: ReviewNotificationData) {
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

  // ── WhatsApp to admin ──
  const apiUrl = cfg['evolution_api_url'];
  const apiKey = cfg['evolution_api_key'];
  const instanceName = cfg['evolution_instance_name'];
  const adminWhatsapp = cfg['whatsapp_number'];

  if (apiUrl && apiKey && instanceName && adminWhatsapp) {
    try {
      const baseUrl = apiUrl.replace(/\/+$/, '');
      const adminText = [
        `${statusEmoji} *Pagamento ${statusLabel}* (após análise)`,
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
      console.log(`[MP Webhook] Admin WhatsApp notification: ${res.ok ? 'sent' : `error:${res.status}`}`);
    } catch (e: any) {
      console.error(`[MP Webhook] Admin WhatsApp error: ${e.message}`);
    }

    // WhatsApp to customer (if phone available)
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
        console.log(`[MP Webhook] Customer WhatsApp notification: ${res.ok ? 'sent' : `error:${res.status}`}`);
      } catch (e: any) {
        console.error(`[MP Webhook] Customer WhatsApp error: ${e.message}`);
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
      console.log(`[MP Webhook] send-email ${isAdmin ? 'admin' : 'customer'}: ${r.status}`);
    } catch (e: any) {
      console.error(`[MP Webhook] send-email error: ${e.message}`);
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

  console.log(`[MP Webhook] Review result notifications sent for order ${data.orderId}: ${statusLabel}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const __startTs = Date.now();
  const __logCtx: any = {
    gateway: 'mercadopago', event_type: null, http_status: 200,
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
    // Read body as text for signature verification, then parse
    const bodyText = await req.text();

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(req, bodyText);
    __logCtx.signature_valid = isValid;
    if (!isValid) {
      console.error('[MP Webhook] Invalid signature — rejecting');
      __logCtx.signature_error = 'HMAC-SHA256 mismatch (manifest id+request-id+ts)';
      try { __logCtx.request_payload = JSON.parse(bodyText); } catch { __logCtx.request_payload = { raw: bodyText.slice(0, 500) }; }
      return new Response(JSON.stringify({ received: true, error: 'invalid_signature' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = JSON.parse(bodyText);
    __logCtx.request_payload = body;
    const { action, type, id: notificationId, data: notificationData, topic } = body;
    __logCtx.event_type = action || topic || type || null;
    __logCtx.external_id = notificationData?.id || notificationId || null;

    // Mercado Pago sends notifications in two formats:
    // 1. IPN (Instant Payment Notification): { topic, id }
    // 2. Webhooks v2: { action, type, data: { id } }
    
    let paymentId: string | null = null;

    if (action && type === 'payment' && notificationData?.id) {
      // Webhooks v2 format
      paymentId = String(notificationData.id);
      console.log(`[MP Webhook v2] Action: ${action}, Payment ID: ${paymentId}`);
    } else if (topic === 'payment' && notificationId) {
      // IPN format
      paymentId = String(notificationId);
      console.log(`[MP IPN] Topic: ${topic}, Payment ID: ${paymentId}`);
    } else if (topic === 'merchant_order' && notificationId) {
      // Merchant order — we need to fetch associated payments
      console.log(`[MP IPN] Merchant order: ${notificationId} — skipping (handled via payment topic)`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.log(`[MP Webhook] Unhandled format:`, JSON.stringify(body).slice(0, 500));
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Mercado Pago environment and access token from settings
    const { data: mpEnvRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'mercadopago_environment')
      .maybeSingle();
    const mpEnv = mpEnvRow?.value || 'sandbox';

    // Try env-specific token first, fallback to generic
    const { data: tokenEnvRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', `mercadopago_access_token_${mpEnv}`)
      .maybeSingle();

    let accessToken = tokenEnvRow?.value;
    if (!accessToken) {
      const { data: tokenRow } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'mercadopago_access_token')
        .maybeSingle();
      accessToken = tokenRow?.value;
    }

    if (!accessToken) {
      console.error('[MP Webhook] Access token not configured');
      return new Response(JSON.stringify({ received: true, error: 'token_missing' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch payment details from MP API to get current status
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error(`[MP Webhook] Failed to fetch payment ${paymentId}: ${mpResponse.status} ${errorText}`);
      return new Response(JSON.stringify({ received: true, error: 'fetch_failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payment = await mpResponse.json();
    console.log(`[MP Webhook] Payment ${paymentId}: status=${payment.status}, detail=${payment.status_detail}, external_ref=${payment.external_reference}`);

    // Map MP status to internal status
    const statusMap: Record<string, string> = {
      approved: 'PAID',
      authorized: 'PENDING',
      pending: 'PENDING',
      in_process: 'IN_REVIEW',
      in_mediation: 'PENDING',
      rejected: 'REFUSED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      charged_back: 'CHARGEBACK',
    };

    const newStatus = statusMap[payment.status] || 'PENDING';

    // Status priority to prevent downgrades
    const statusPriority: Record<string, number> = {
      'PENDING': 1,
      'IN_REVIEW': 2,
      'AWAITING_RISK_ANALYSIS': 2,
      'OVERDUE': 3,
      'REFUSED': 5,
      'REPROVED': 5,
      'PAID': 10,
      'CONFIRMED': 10,
      'RECEIVED': 10,
      'REFUNDED': 11,
      'CHARGEBACK': 12,
      'CANCELLED': 6,
    };

    const externalRef = payment.external_reference;

    if (externalRef) {
      __logCtx.order_id = externalRef;
      // Find order by external_reference (our order ID)
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('status, customer_name, customer_email, customer_phone, product_name, total_value, payment_method, dosage, quantity')
        .eq('id', externalRef)
        .maybeSingle();

      if (existingOrder) {
        const previousStatus = existingOrder.status;
        const currentPriority = statusPriority[previousStatus] ?? 0;
        const newPriority = statusPriority[newStatus] ?? 1;

        if (newPriority > currentPriority || previousStatus === newStatus) {
          const { error } = await supabase
            .from('orders')
            .update({
              status: newStatus,
              asaas_payment_id: paymentId,
            })
            .eq('id', externalRef);

          if (error) {
            console.error(`[MP Webhook] DB update error: ${error.message}`);
          } else {
            console.log(`[MP Webhook] Order ${externalRef} updated: ${previousStatus} → ${newStatus}`);

            // Send notifications on any terminal transition (PAID/REFUSED) when status actually changed
            const statusChanged = previousStatus !== newStatus;
            if (statusChanged && (newStatus === 'PAID' || newStatus === 'REFUSED')) {
              try {
                await sendReviewResultNotification(supabase, {
                  orderId: externalRef,
                  customerName: existingOrder.customer_name,
                  customerEmail: existingOrder.customer_email,
                  customerPhone: existingOrder.customer_phone,
                  productName: existingOrder.product_name,
                  totalValue: existingOrder.total_value,
                  paymentMethod: existingOrder.payment_method,
                  newStatus,
                });
              } catch (notifErr: any) {
                console.error(`[MP Webhook] Notification error: ${notifErr.message}`);
              }
            }
          }
        } else {
          console.log(`[MP Webhook] Skipping downgrade: ${previousStatus} (${currentPriority}) → ${newStatus} (${newPriority})`);
        }
      } else {
        console.log(`[MP Webhook] Order not found for external_reference: ${externalRef}`);
      }
    }

    // Also try to find by asaas_payment_id (which stores MP payment ID too)
    const { data: orderByPaymentId } = await supabase
      .from('orders')
      .select('id, status, customer_name, customer_email, customer_phone, product_name, total_value, payment_method')
      .eq('asaas_payment_id', paymentId)
      .maybeSingle();

    if (orderByPaymentId && orderByPaymentId.id !== externalRef) {
      const previousStatus = orderByPaymentId.status;
      const currentPriority = statusPriority[previousStatus] ?? 0;
      const newPriority = statusPriority[newStatus] ?? 1;

      if (newPriority > currentPriority) {
        await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('id', orderByPaymentId.id);
        console.log(`[MP Webhook] Order ${orderByPaymentId.id} updated via payment_id lookup`);

        // Send notifications on any terminal transition (PAID/REFUSED) when status actually changed
        const statusChanged2 = previousStatus !== newStatus;
        if (statusChanged2 && (newStatus === 'PAID' || newStatus === 'REFUSED')) {
          try {
            await sendReviewResultNotification(supabase, {
              orderId: orderByPaymentId.id,
              customerName: orderByPaymentId.customer_name,
              customerEmail: orderByPaymentId.customer_email,
              customerPhone: orderByPaymentId.customer_phone,
              productName: orderByPaymentId.product_name,
              totalValue: orderByPaymentId.total_value,
              paymentMethod: orderByPaymentId.payment_method,
              newStatus,
            });
          } catch (notifErr: any) {
            console.error(`[MP Webhook] Notification error: ${notifErr.message}`);
          }
        }
      }
    }

    if (newStatus === 'PAID') {
      console.log(`[MP Webhook] Payment ${paymentId} confirmed. Auto-shipping disabled — label must be created manually.`);

      // Increment coupon usage for confirmed payments
      const targetOrderId = externalRef || orderByPaymentId?.id;
      if (targetOrderId) {
        const { data: orderForCoupon } = await supabase
          .from('orders')
          .select('coupon_code')
          .eq('id', targetOrderId)
          .maybeSingle();

        if (orderForCoupon?.coupon_code) {
          await supabase.rpc('increment_coupon_usage', { _coupon_code: orderForCoupon.coupon_code });
          console.log(`[MP Webhook] Coupon usage incremented for: ${orderForCoupon.coupon_code}`);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[MP Webhook] Error:', error.message);
    __logCtx.error_message = error.message;
    // Always return 200 to avoid MP retries
    return new Response(JSON.stringify({ received: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await __writeLog();
  }
});
