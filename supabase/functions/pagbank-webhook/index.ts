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

  try {
    const bodyText = await req.text();
    console.log('[PagBank Webhook] Received:', bodyText.slice(0, 500));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = JSON.parse(bodyText);

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

      // Send admin notifications for approved/refused payments
      if (newStatus === 'PAID' || newStatus === 'REFUSED') {
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
    // Always return 200 to avoid PagBank retries penalizing us
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
