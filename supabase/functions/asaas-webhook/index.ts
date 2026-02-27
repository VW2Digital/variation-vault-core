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

    const body = await req.json();
    const { event, payment } = body;

    console.log(`[Webhook] Event: ${event}, Payment ID: ${payment?.id}`);

    if (!payment?.id) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map Asaas events to our order status
    let newStatus: string | null = null;

    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        newStatus = 'PAID';
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
      default:
        console.log(`[Webhook] Unhandled event: ${event}`);
    }

    if (newStatus) {
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
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Webhook] Error:', error.message);
    // Always return 200 to Asaas to avoid retries
    return new Response(JSON.stringify({ received: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
