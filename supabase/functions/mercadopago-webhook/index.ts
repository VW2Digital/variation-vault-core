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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read body as text for signature verification, then parse
    const bodyText = await req.text();

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(req, bodyText);
    if (!isValid) {
      console.error('[MP Webhook] Invalid signature — rejecting');
      return new Response(JSON.stringify({ received: true, error: 'invalid_signature' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = JSON.parse(bodyText);
    const { action, type, id: notificationId, data: notificationData, topic } = body;

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
      // Find order by external_reference (our order ID)
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('status')
        .eq('id', externalRef)
        .maybeSingle();

      if (existingOrder) {
        const currentPriority = statusPriority[existingOrder.status] ?? 0;
        const newPriority = statusPriority[newStatus] ?? 1;

        if (newPriority > currentPriority || existingOrder.status === newStatus) {
          const { error } = await supabase
            .from('orders')
            .update({
              status: newStatus,
              asaas_payment_id: paymentId, // store MP payment ID in same field for compatibility
            })
            .eq('id', externalRef);

          if (error) {
            console.error(`[MP Webhook] DB update error: ${error.message}`);
          } else {
            console.log(`[MP Webhook] Order ${externalRef} updated: ${existingOrder.status} → ${newStatus}`);
          }
        } else {
          console.log(`[MP Webhook] Skipping downgrade: ${existingOrder.status} (${currentPriority}) → ${newStatus} (${newPriority})`);
        }
      } else {
        console.log(`[MP Webhook] Order not found for external_reference: ${externalRef}`);
      }
    }

    // Also try to find by asaas_payment_id (which stores MP payment ID too)
    const { data: orderByPaymentId } = await supabase
      .from('orders')
      .select('id, status')
      .eq('asaas_payment_id', paymentId)
      .maybeSingle();

    if (orderByPaymentId && orderByPaymentId.id !== externalRef) {
      const currentPriority = statusPriority[orderByPaymentId.status] ?? 0;
      const newPriority = statusPriority[newStatus] ?? 1;

      if (newPriority > currentPriority) {
        await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('id', orderByPaymentId.id);
        console.log(`[MP Webhook] Order ${orderByPaymentId.id} updated via payment_id lookup`);
      }
    }

    if (newStatus === 'PAID') {
      console.log(`[MP Webhook] Payment ${paymentId} confirmed. Auto-shipping disabled — label must be created manually.`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[MP Webhook] Error:', error.message);
    // Always return 200 to avoid MP retries
    return new Response(JSON.stringify({ received: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
