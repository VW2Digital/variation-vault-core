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
      if (updErr) console.error('[Pagar.me Webhook] DB update error:', updErr.message);
      else console.log(`[Pagar.me Webhook] Order ${orderCode}: ${previousStatus} -> ${newStatus}`);
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
