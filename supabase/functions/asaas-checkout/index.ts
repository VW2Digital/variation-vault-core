import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

async function asaasFetch(baseUrl: string, apiKey: string, path: string, method: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  
  const data = await res.json();
  if (!res.ok) {
    console.error('Asaas API error:', JSON.stringify(data));
    throw new Error(data.errors?.[0]?.description || `Asaas error [${res.status}]`);
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
    
    const { action, ...payload } = await req.json();
    const { apiKey, baseUrl } = await getAsaasConfig(supabaseUrl, supabaseKey);

    let result;

    switch (action) {
      case 'create_customer': {
        const { name, email, cpfCnpj, phone } = payload;
        result = await asaasFetch(baseUrl, apiKey, '/customers', 'POST', {
          name,
          email,
          cpfCnpj,
          mobilePhone: phone,
        });
        break;
      }

      case 'create_pix_payment': {
        const { customer, value, description } = payload;
        result = await asaasFetch(baseUrl, apiKey, '/payments', 'POST', {
          customer,
          billingType: 'PIX',
          value,
          description,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });

        // Get PIX QR code
        if (result.id) {
          const pixData = await asaasFetch(baseUrl, apiKey, `/payments/${result.id}/pixQrCode`, 'GET');
          result.pixQrCode = pixData;
        }
        break;
      }

      case 'create_card_payment': {
        const { customer, value, description, creditCard, creditCardHolderInfo, installmentCount } = payload;
        result = await asaasFetch(baseUrl, apiKey, '/payments', 'POST', {
          customer,
          billingType: 'CREDIT_CARD',
          value,
          description,
          dueDate: new Date().toISOString().split('T')[0],
          installmentCount: installmentCount || 1,
          installmentValue: installmentCount ? +(value / installmentCount).toFixed(2) : undefined,
          creditCard,
          creditCardHolderInfo,
        });
        break;
      }

      case 'get_payment_status': {
        const { paymentId } = payload;
        result = await asaasFetch(baseUrl, apiKey, `/payments/${paymentId}`, 'GET');
        break;
      }

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
