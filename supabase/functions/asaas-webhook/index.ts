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
        .select('status')
        .eq('asaas_payment_id', payment.id)
        .maybeSingle();

      const currentPriority = statusPriority[existingOrder?.status || ''] ?? 0;

      if (currentPriority >= newPriority && existingOrder?.status !== newStatus) {
        console.log(`[Webhook] Skipping downgrade: ${existingOrder?.status} (${currentPriority}) → ${newStatus} (${newPriority})`);
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
        }
      } // end of downgrade check

      // Auto-shipping disabled — labels are created manually via admin panel
      if (newStatus === 'PAID') {
        console.log('[Webhook] Payment confirmed. Auto-shipping disabled — label must be created manually.');
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