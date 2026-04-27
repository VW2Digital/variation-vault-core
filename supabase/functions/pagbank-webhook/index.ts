import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

function mapPagBankStatus(pbStatus: string): string {
  const map: Record<string, string> = {
    PAID: 'PAID',
    AUTHORIZED: 'PENDING',
    IN_ANALYSIS: 'IN_REVIEW',
    DECLINED: 'REFUSED',
    CANCELED: 'CANCELLED',
    WAITING: 'PENDING',
  };
  return map[pbStatus] || 'PENDING';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const __startTs = Date.now();
  const __logCtx: any = {
    gateway: 'pagbank', event_type: null, http_status: 200,
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
    const bodyText = await req.text();
    console.log('[PagBank Webhook] Received:', bodyText.slice(0, 500));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = JSON.parse(bodyText);
    __logCtx.request_payload = body;
    __logCtx.event_type = body?.charges?.[0]?.status || 'order_update';
    __logCtx.external_id = body?.id || null;
    if (body?.reference_id) __logCtx.order_id = body.reference_id;

    // PagBank sends notifications with charges array
    // Format: { id, reference_id, charges: [{ id, status, ... }], ... }
    const referenceId = body.reference_id;
    const charges = body.charges || [];
    const charge = charges[0];

    if (!charge) {
      console.log('[PagBank Webhook] No charge data found — skipping');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chargeStatus = charge.status;
    const newStatus = mapPagBankStatus(chargeStatus);
    const pagbankOrderId = body.id;

    console.log(`[PagBank Webhook] Order: ${pagbankOrderId}, Ref: ${referenceId}, Charge Status: ${chargeStatus} -> ${newStatus}`);

    if (!referenceId) {
      console.log('[PagBank Webhook] No reference_id — cannot match order');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find order by reference_id (our order ID)
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('status, customer_name, customer_email, customer_phone, product_name, total_value, payment_method')
      .eq('id', referenceId)
      .maybeSingle();

    if (!existingOrder) {
      console.log(`[PagBank Webhook] Order ${referenceId} not found in database`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const previousStatus = existingOrder.status;
    const currentPriority = statusPriority[previousStatus] ?? 0;
    const newPriority = statusPriority[newStatus] ?? 1;

    if (newPriority > currentPriority || previousStatus === newStatus) {
      const { error } = await supabase
        .from('orders')
        .update({
          status: newStatus,
          asaas_payment_id: pagbankOrderId,
        })
        .eq('id', referenceId);

      if (error) {
        console.error(`[PagBank Webhook] DB update error: ${error.message}`);
      } else {
        console.log(`[PagBank Webhook] Order ${referenceId}: ${previousStatus} -> ${newStatus}`);
      }

      // Increment coupon usage on first transition to PAID
      if (newStatus === 'PAID' && previousStatus !== 'PAID') {
        try {
          const { data: orderForCoupon } = await supabase
            .from('orders')
            .select('coupon_code')
            .eq('id', referenceId)
            .maybeSingle();
          if (orderForCoupon?.coupon_code) {
            await supabase.rpc('increment_coupon_usage', { _coupon_code: orderForCoupon.coupon_code });
            console.log(`[PagBank Webhook] Coupon usage incremented for: ${orderForCoupon.coupon_code}`);
          }
        } catch (couponErr: any) {
          console.error(`[PagBank Webhook] Coupon increment error: ${couponErr?.message}`);
        }
      }

      // Send admin notifications for approved/refused payments
      if (newStatus === 'PAID' || newStatus === 'REFUSED') {
        try {
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
          const valueFormatted = Number(existingOrder.total_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const isApproved = newStatus === 'PAID';
          const statusLabel = isApproved ? 'APROVADO' : 'RECUSADO';
          const method = existingOrder.payment_method === 'credit_card' ? 'Cartao de Credito' : 'PIX';

          // WhatsApp to admin
          const apiUrl = cfg['evolution_api_url'];
          const apiKey = cfg['evolution_api_key'];
          const instanceName = cfg['evolution_instance_name'];
          const adminWhatsapp = cfg['whatsapp_number'];

          if (apiUrl && apiKey && instanceName && adminWhatsapp) {
            const baseUrl = apiUrl.replace(/\/+$/, '');
            const adminText = [
              `${isApproved ? 'V' : 'X'} *Pagamento ${statusLabel}* (PagBank)`,
              ``,
              `Cliente: ${existingOrder.customer_name || 'N/A'}`,
              `Email: ${existingOrder.customer_email || 'N/A'}`,
              `Produto: ${existingOrder.product_name || 'N/A'}`,
              `Valor: ${valueFormatted}`,
              `Metodo: ${method}`,
              `Pedido: ${referenceId}`,
              `Horario: ${now}`,
            ].join('\n');

            const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify({ number: adminWhatsapp.replace(/\D/g, ''), text: adminText }),
            });
            console.log(`[PagBank Webhook] Admin WhatsApp: ${res.ok ? 'sent' : `error:${res.status}`}`);

            // WhatsApp to customer
            if (notifyCustomer && existingOrder.customer_phone) {
              try {
                const customerPhoneClean = existingOrder.customer_phone.replace(/\D/g, '');
                const phoneWithCountry = customerPhoneClean.startsWith('55') ? customerPhoneClean : `55${customerPhoneClean}`;
                const firstName = (existingOrder.customer_name || 'Cliente').split(' ')[0];

                const customerText = isApproved
                  ? [
                      `✅ *Pagamento Aprovado!*`,
                      ``,
                      `Olá ${firstName}! 🎉`,
                      ``,
                      `Seu pagamento de ${valueFormatted} para o pedido "${existingOrder.product_name}" foi *aprovado*!`,
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
                      `Infelizmente, seu pagamento de ${valueFormatted} para "${existingOrder.product_name}" não foi aprovado.`,
                      ``,
                      `Você pode tentar novamente com outro cartão ou pagar via PIX para aprovação imediata.`,
                      ``,
                      `Se precisar de ajuda, estamos à disposição! 🤝`,
                    ].join('\n');

                const cRes = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                  body: JSON.stringify({ number: phoneWithCountry, text: customerText }),
                });
                console.log(`[PagBank Webhook] Customer WhatsApp: ${cRes.ok ? 'sent' : `error:${cRes.status}`}`);
              } catch (e: any) {
                console.error(`[PagBank Webhook] Customer WhatsApp error: ${e.message}`);
              }
            }
          }
        } catch (e: any) {
          console.error(`[PagBank Webhook] Notification error: ${e.message}`);
        }
      }
    } else {
      console.log(`[PagBank Webhook] Skipping downgrade: ${previousStatus} (${currentPriority}) -> ${newStatus} (${newPriority})`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error(`[PagBank Webhook] Error: ${error.message}`);
    __logCtx.error_message = error.message;
    // Always return 200 to avoid PagBank retries penalizing us
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await __writeLog();
  }
});
