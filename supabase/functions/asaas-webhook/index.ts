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
      // Return 200 to avoid Asaas penalization, but log the rejection
      return new Response(JSON.stringify({ received: true, warning: 'token_mismatch' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { event, payment } = body;

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
            ]);

          const cfg: Record<string, string> = {};
          for (const s of settings || []) cfg[s.key] = s.value;

          const valueFormatted = Number(orderForNotif.total_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const isApproved = newStatus === 'PAID';
          const firstName = (orderForNotif.customer_name || 'Cliente').split(' ')[0];

          const apiUrl = cfg['evolution_api_url'];
          const apiKey = cfg['evolution_api_key'];
          const instanceName = cfg['evolution_instance_name'];

          // WhatsApp to customer
          if (apiUrl && apiKey && instanceName && orderForNotif.customer_phone) {
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
          const fromEmail = cfg['resend_from_email'];
          if (resendKey && fromEmail && orderForNotif.customer_email) {
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
                  subject: isApproved
                    ? `✅ Pagamento Aprovado - ${orderForNotif.product_name}`
                    : `Pagamento Não Aprovado - ${orderForNotif.product_name}`,
                  html: customerHtml,
                }),
              });
              console.log(`[Webhook] Customer email: ${eRes.ok ? 'sent' : `error:${eRes.status}`}`);
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
    // Always return 200 to Asaas to avoid retries/penalties
    return new Response(JSON.stringify({ received: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});