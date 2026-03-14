import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getAsaasConfig(supabaseUrl: string, supabaseKey: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: apiKeyRow } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'asaas_api_key')
    .maybeSingle();

  const { data: envRow } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'asaas_environment')
    .maybeSingle();

  const apiKey = apiKeyRow?.value;
  const environment = envRow?.value || 'sandbox';

  if (!apiKey) throw new Error('Asaas API Key não configurada');

  const baseUrl = environment === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

  return { apiKey, baseUrl };
}

function getRemoteIp(req: Request) {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    req.headers.get('x-real-ip'),
    req.headers.get('x-client-ip'),
    req.headers.get('fly-client-ip'),
  ];

  const validIp = candidates.find((ip) => typeof ip === 'string' && ip.length > 0 && ip.toLowerCase() !== 'unknown');
  return validIp ?? '127.0.0.1';
}

function toCurrencyNumber(value: number) {
  return Number(Number(value).toFixed(2));
}

async function asaasFetch(baseUrl: string, apiKey: string, path: string, method: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'access_token': apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const raw = await res.text();
  let data: any = {};

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }
  }

  if (!res.ok) {
    console.error('Asaas API error:', JSON.stringify(data));

    const joinedErrors = Array.isArray(data?.errors)
      ? data.errors.map((item: any) => item?.description).filter(Boolean).join(' | ')
      : '';

    throw new Error(joinedErrors || data?.message || `Asaas error [${res.status}]`);
  }

  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...payload } = await req.json();
    const { apiKey, baseUrl } = await getAsaasConfig(supabaseUrl, supabaseKey);

    let result;

    switch (action) {
      // ─── 1. CREATE OR FIND CUSTOMER ───
      case 'create_customer': {
        const { name, email, cpfCnpj, phone } = payload;

        // Try to find existing customer by CPF
        const existing = await asaasFetch(baseUrl, apiKey, `/customers?cpfCnpj=${cpfCnpj}`, 'GET');
        if (existing?.data?.length > 0) {
          // Update existing customer
          const customerId = existing.data[0].id;
          result = await asaasFetch(baseUrl, apiKey, `/customers/${customerId}`, 'PUT', {
            name,
            email,
            mobilePhone: phone,
          });
        } else {
          // Create new customer
          result = await asaasFetch(baseUrl, apiKey, '/customers', 'POST', {
            name,
            email,
            cpfCnpj,
            mobilePhone: phone,
          });
        }
        break;
      }

      // ─── 2. PIX PAYMENT ───
      case 'create_pix_payment': {
        const { customer, value, description, orderId } = payload;
        result = await asaasFetch(baseUrl, apiKey, '/payments', 'POST', {
          customer,
          billingType: 'PIX',
          value: toCurrencyNumber(value),
          description,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          externalReference: orderId || undefined,
        });

        // Get PIX QR code
        if (result.id) {
          const pixData = await asaasFetch(baseUrl, apiKey, `/payments/${result.id}/pixQrCode`, 'GET');
          result.pixQrCode = pixData;

          // Update order with payment ID
          if (orderId) {
            await supabase
              .from('orders')
              .update({ asaas_payment_id: result.id, status: result.status || 'PENDING' })
              .eq('id', orderId);
          }
        }
        break;
      }

      // ─── 3. TOKENIZE CREDIT CARD ───
      case 'tokenize_credit_card': {
        const { customer, creditCard, creditCardHolderInfo } = payload;
        const remoteIp = getRemoteIp(req);

        result = await asaasFetch(baseUrl, apiKey, '/creditCard/tokenizeCreditCard', 'POST', {
          customer,
          creditCard,
          creditCardHolderInfo,
          remoteIp,
        });
        break;
      }

      // ─── 4. CREDIT CARD PAYMENT (with token) ───
      case 'create_card_payment': {
        const { customer, value, description, creditCardToken, creditCardHolderInfo, installmentCount, orderId } = payload;
        const remoteIp = getRemoteIp(req);

        const paymentBody: any = {
          customer,
          billingType: 'CREDIT_CARD',
          value: toCurrencyNumber(value),
          description,
          dueDate: new Date().toISOString().split('T')[0],
          creditCardToken,
          creditCardHolderInfo,
          remoteIp,
          externalReference: orderId || undefined,
        };

        // Installments
        if (installmentCount && Number(installmentCount) > 1) {
          paymentBody.installmentCount = Number(installmentCount);
        }

        result = await asaasFetch(baseUrl, apiKey, '/payments', 'POST', paymentBody);

        // Update order with payment ID and status
        if (orderId && result.id) {
          await supabase
            .from('orders')
            .update({ asaas_payment_id: result.id, status: result.status || 'PENDING' })
            .eq('id', orderId);
        }
        break;
      }

      // ─── 5. CHECK PAYMENT STATUS ───
      case 'get_payment_status': {
        const { paymentId } = payload;
        result = await asaasFetch(baseUrl, apiKey, `/payments/${paymentId}`, 'GET');
        break;
      }

      // ─── 6. LIST PAYMENTS ───
      case 'list_payments': {
        const limit = payload.limit || 50;
        const offset = payload.offset || 0;
        result = await asaasFetch(baseUrl, apiKey, `/payments?limit=${limit}&offset=${offset}`, 'GET');
        break;
      }

      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error:', error.message);

    // Log failure to payment_logs table for admin diagnostics
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, supabaseKey);

      const body = await req.clone().json().catch(() => ({}));
      await sb.from('payment_logs').insert({
        error_message: error.message,
        error_source: 'backend',
        payment_method: body?.action?.includes('card') ? 'credit_card' : body?.action?.includes('pix') ? 'pix' : body?.action || null,
        order_id: body?.orderId || null,
        request_payload: { action: body?.action, customer: body?.customer },
      });
    } catch { /* non-blocking */ }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
