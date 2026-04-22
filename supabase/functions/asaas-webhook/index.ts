import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const __startTs = Date.now();
  const __logCtx: any = {
    gateway: 'asaas', event_type: null, http_status: 200,
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

    // ─── TOKEN VALIDATION ───
    // Check multiple sources: header (asaas-access-token), query param, or URL token
    const url = new URL(req.url);
    const incomingToken =
      req.headers.get('asaas-access-token') ||
      url.searchParams.get('access_token') ||
      url.searchParams.get('token') ||
      '';

    const { data: tokenSetting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'asaas_webhook_token')
      .maybeSingle();

    const expectedToken = tokenSetting?.value || '';

    // Only validate if a token is configured; if empty, accept all (for initial setup)
    if (expectedToken && incomingToken !== expectedToken) {
      console.error(`[Webhook] Invalid token. Got: "${incomingToken?.slice(0, 8)}..." Expected: "${expectedToken?.slice(0, 8)}..."`);
      __logCtx.signature_valid = false;
      __logCtx.signature_error = 'Token mismatch (asaas-access-token header / query param)';
      // Return 200 to avoid Asaas penalization, but log the rejection
      return new Response(JSON.stringify({ received: true, warning: 'token_mismatch' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (expectedToken) {
      __logCtx.signature_valid = true;
    }

    const body = await req.json();
    __logCtx.request_payload = body;
    const { event, payment } = body;
    __logCtx.event_type = event || null;
    __logCtx.external_id = payment?.id || null;
    if (payment?.externalReference) __logCtx.order_id = payment.externalReference;

    console.log(`[Webhook] Event: ${event}, Payment ID: ${payment?.id}, Status: ${payment?.status}`);

    if (!payment?.id) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── EVENT → STATUS MAPPING ───
    let newStatus: string | null = null;

    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        newStatus = 'PAID';
        break;
      case 'PAYMENT_CREATED':
        newStatus = 'PENDING';
        break;
      case 'PAYMENT_OVERDUE':
        newStatus = 'OVERDUE';
        break;
      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        newStatus = 'REFUNDED';
        break;
      case 'PAYMENT_UPDATED':
        newStatus = payment.status || null;
        break;
      case 'PAYMENT_AWAITING_RISK_ANALYSIS':
        newStatus = 'AWAITING_RISK_ANALYSIS';
        break;
      case 'PAYMENT_APPROVED_BY_RISK_ANALYSIS':
        newStatus = 'PAID';
        break;
      case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
        newStatus = 'REPROVED';
        break;
      case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
        newStatus = 'REFUSED';
        break;
      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    if (newStatus) {
      // ─── PREVENT STATUS DOWNGRADE ───
      // Define status priority: higher = more advanced in lifecycle
      const statusPriority: Record<string, number> = {
        'PENDING': 1,
        'AWAITING_RISK_ANALYSIS': 2,
        'OVERDUE': 3,
        'PAID': 10,
        'CONFIRMED': 10,
        'RECEIVED': 10,
        'REFUNDED': 11,
        'REFUSED': 5,
        'REPROVED': 5,
      };

      const newPriority = statusPriority[newStatus] ?? 1;

      // Check current status before updating to avoid downgrade
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, status, customer_name, customer_email, customer_phone, product_name, total_value, payment_method')
        .eq('asaas_payment_id', payment.id)
        .maybeSingle();

      let orderForNotif = existingOrder;
      const previousStatus = existingOrder?.status || '';
      const currentPriority = statusPriority[previousStatus] ?? 0;

      if (currentPriority >= newPriority && previousStatus !== newStatus) {
        console.log(`[Webhook] Skipping downgrade: ${previousStatus} (${currentPriority}) → ${newStatus} (${newPriority})`);
      } else {
        // Update by asaas_payment_id
        const { error } = await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('asaas_payment_id', payment.id);

        if (error) {
          console.error('[Webhook] DB update error:', error.message);
        } else {
          console.log(`[Webhook] Order updated to ${newStatus} for payment ${payment.id}`);
        }

        // Also try by externalReference (our order id)
        if (payment.externalReference) {
          await supabase
            .from('orders')
            .update({ status: newStatus, asaas_payment_id: payment.id })
            .eq('id', payment.externalReference);

          // Reload order data if not found by payment_id (lazy creation case)
          if (!orderForNotif) {
            const { data: byRef } = await supabase
              .from('orders')
              .select('id, status, customer_name, customer_email, customer_phone, product_name, total_value, payment_method')
              .eq('id', payment.externalReference)
              .maybeSingle();
            orderForNotif = byRef;
          }
        }
      } // end of downgrade check

      // Auto-shipping disabled — labels are created manually via admin panel
      if (newStatus === 'PAID') {
        console.log('[Webhook] Payment confirmed. Auto-shipping disabled — label must be created manually.');

        // Increment coupon usage for confirmed payments
        const orderId = payment.externalReference;
        if (orderId) {
          const { data: orderData } = await supabase
            .from('orders')
            .select('coupon_code')
            .eq('id', orderId)
            .maybeSingle();

          if (orderData?.coupon_code) {
            await supabase.rpc('increment_coupon_usage', { _coupon_code: orderData.coupon_code });
            console.log(`[Webhook] Coupon usage incremented for: ${orderData.coupon_code}`);
          }
        }
      }

      // ─── SEND CUSTOMER + ADMIN NOTIFICATIONS ON STATUS CHANGE ───
      const statusChanged = previousStatus !== newStatus;
      const isTerminal = newStatus === 'PAID' || newStatus === 'REFUSED' || newStatus === 'REPROVED';
      if (statusChanged && isTerminal && orderForNotif) {
        try {
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
          if (!notifyCustomer) {
            console.log('[Webhook] Customer notifications disabled in settings — skipping');
          }

          const valueFormatted = Number(orderForNotif.total_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const isApproved = newStatus === 'PAID';
          const firstName = (orderForNotif.customer_name || 'Cliente').split(' ')[0];

          const apiUrl = cfg['evolution_api_url'];
          const apiKey = cfg['evolution_api_key'];
          const instanceName = cfg['evolution_instance_name'];

          // WhatsApp to customer
          if (notifyCustomer && apiUrl && apiKey && instanceName && orderForNotif.customer_phone) {
            const baseUrl = apiUrl.replace(/\/+$/, '');
            const customerPhoneClean = orderForNotif.customer_phone.replace(/\D/g, '');
            const phoneWithCountry = customerPhoneClean.startsWith('55') ? customerPhoneClean : `55${customerPhoneClean}`;

            const customerText = isApproved
              ? [
                  `✅ *Pagamento Aprovado!*`,
                  ``,
                  `Olá ${firstName}! 🎉`,
                  ``,
                  `Seu pagamento de ${valueFormatted} para o pedido "${orderForNotif.product_name}" foi *aprovado*!`,
                  ``,
                  `Agora vamos preparar seu pedido para envio. Você receberá o código de rastreio em breve.`,
                  ``,
                  `Obrigado por comprar conosco! 💚`,
                ].join('\n')
              : [
                  `❌ *Pagamento Não Aprovado*`,
                  ``,
                  `Olá ${firstName},`,
                  ``,
                  `Infelizmente, seu pagamento de ${valueFormatted} para "${orderForNotif.product_name}" não foi aprovado.`,
                  ``,
                  `Você pode tentar novamente com outro cartão ou pagar via PIX para aprovação imediata.`,
                  ``,
                  `Estamos à disposição para ajudar! 🤝`,
                ].join('\n');

            try {
              const cRes = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ number: phoneWithCountry, text: customerText }),
              });
              console.log(`[Webhook] Customer WhatsApp: ${cRes.ok ? 'sent' : `error:${cRes.status}`}`);
            } catch (e: any) {
              console.error(`[Webhook] Customer WhatsApp error: ${e.message}`);
            }
          }

          // Email to customer
          const resendKey = cfg['resend_api_key'] || Deno.env.get('RESEND_API_KEY');
          const configuredFrom = cfg['resend_from_email'] || '';
          const PUBLIC_DOMAINS = ['gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','yahoo.com','yahoo.com.br','icloud.com','msn.com','bol.com.br','uol.com.br','terra.com.br'];
          const fromDomain = configuredFrom.split('@')[1]?.toLowerCase() || '';
          const isPublicDomain = PUBLIC_DOMAINS.includes(fromDomain);
          // Resend bloqueia envios usando domínios públicos. Fallback: onboarding@resend.dev + reply_to admin.
          const fromEmail = isPublicDomain || !configuredFrom ? 'onboarding@resend.dev' : configuredFrom;
          const replyToEmail = configuredFrom && configuredFrom.includes('@') ? configuredFrom : undefined;
          if (isPublicDomain) {
            console.warn(`[Asaas Webhook] resend_from_email (${configuredFrom}) usa domínio público — usando fallback onboarding@resend.dev.`);
          }
          if (notifyCustomer && resendKey && fromEmail && orderForNotif.customer_email) {
            const customerHtml = isApproved
              ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#38a169;">✅ Pagamento Aprovado!</h2>
                  <p>Olá ${firstName},</p>
                  <p>Seu pagamento de <strong>${valueFormatted}</strong> para <strong>"${orderForNotif.product_name}"</strong> foi <strong>aprovado</strong>!</p>
                  <p>Agora vamos preparar seu pedido para envio. Você receberá o código de rastreio em breve.</p>
                  <p>Obrigado por comprar conosco! 💚</p>
                </div>`
              : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#e53e3e;">Pagamento Não Aprovado</h2>
                  <p>Olá ${firstName},</p>
                  <p>Infelizmente, seu pagamento de <strong>${valueFormatted}</strong> para <strong>"${orderForNotif.product_name}"</strong> não foi aprovado.</p>
                  <p>Você pode tentar novamente com outro cartão ou pagar via PIX para aprovação imediata.</p>
                </div>`;
            try {
              const eRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
                body: JSON.stringify({
                  from: `Liberty Pharma <${fromEmail}>`,
                  to: [orderForNotif.customer_email],
                  ...(replyToEmail ? { reply_to: replyToEmail } : {}),
                  subject: isApproved
                    ? `✅ Pagamento Aprovado - ${orderForNotif.product_name}`
                    : `Pagamento Não Aprovado - ${orderForNotif.product_name}`,
                  html: customerHtml,
                }),
              });
              const eBody = await eRes.text();
              console.log(`[Asaas Webhook] Customer email: ${eRes.ok ? 'sent' : `error:${eRes.status} body:${eBody.slice(0,300)}`}`);
            } catch (e: any) {
              console.error(`[Webhook] Customer email error: ${e.message}`);
            }
          }
        } catch (notifErr: any) {
          console.error('[Webhook] Notification block error:', notifErr.message);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Webhook] Error:', error.message);
    __logCtx.error_message = error.message;
    // Always return 200 to Asaas to avoid retries/penalties
    return new Response(JSON.stringify({ received: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await __writeLog();
  }
});