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

  return { apiKey, baseUrl, environment };
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

/**
 * Tabela de juros padrão (fallback se não houver configuração no banco)
 */
const DEFAULT_INTEREST_TABLE: Record<number, number> = {
  1: 0, 2: 0.05, 3: 0.07, 4: 0.09, 5: 0.12, 6: 0.15,
  7: 0.18, 8: 0.21, 9: 0.24, 10: 0.27, 11: 0.30, 12: 0.33,
};

/**
 * Carrega a tabela de juros do banco de dados (site_settings).
 * Retorna a tabela padrão se não encontrar ou se houver erro.
 */
async function loadInterestTable(supabaseUrl: string, supabaseKey: string): Promise<Record<number, number>> {
  try {
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data } = await sb.from('site_settings').select('value').eq('key', 'installments_interest_table').maybeSingle();
    if (!data?.value) return { ...DEFAULT_INTEREST_TABLE };
    const parsed = JSON.parse(data.value);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_INTEREST_TABLE };
    const table: Record<number, number> = {};
    for (let i = 1; i <= 12; i++) {
      const val = Number(parsed[String(i)] ?? parsed[i]);
      table[i] = Number.isFinite(val) && val >= 0 ? val : (DEFAULT_INTEREST_TABLE[i] ?? 0);
    }
    return table;
  } catch {
    return { ...DEFAULT_INTEREST_TABLE };
  }
}

/**
 * Recalcula o valor final com juros embutidos no backend (fonte da verdade).
 */
function calcularParcelamentoBackend(valorBase: number, parcelas: number, interestTable: Record<number, number>) {
  if (parcelas < 1 || parcelas > 12 || !Number.isInteger(parcelas)) {
    throw new Error(`Parcelas inválidas: ${parcelas}`);
  }
  const percentual = interestTable[parcelas] ?? 0;
  const valorFinal = toCurrencyNumber(valorBase * (1 + percentual));
  const valorParcela = toCurrencyNumber(valorFinal / parcelas);
  return { valorFinal, valorParcela, percentual };
}

function sanitizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, '');
  // Remove country code 55 if present (13 digits: 55 + DDD + 9XXXX-XXXX)
  if (digits.length === 13 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  // Must be 10 or 11 digits (DDD + number)
  if (digits.length < 10 || digits.length > 11) return undefined;
  return digits;
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
      // ─── TEST CONNECTION ───
      case 'test_connection': {
        const data = await asaasFetch(baseUrl, apiKey, '/finance/getCurrentBalance', 'GET');
        result = { success: true, walletId: data?.walletId || null, balance: data?.totalBalance ?? null };
        break;
      }

      // ─── 1. CREATE OR FIND CUSTOMER ───
      case 'create_customer': {
        const { name, email, cpfCnpj, phone } = payload;
        const sanitizedPhone = sanitizePhone(phone);

        // Try to find existing customer by CPF (prevents duplicates)
        const existing = await asaasFetch(baseUrl, apiKey, `/customers?cpfCnpj=${cpfCnpj}`, 'GET');
        if (existing?.data?.length > 0) {
          const customerId = existing.data[0].id;
          const updateBody: any = { name, email };
          if (sanitizedPhone) updateBody.mobilePhone = sanitizedPhone;
          result = await asaasFetch(baseUrl, apiKey, `/customers/${customerId}`, 'PUT', updateBody);
        } else {
          const createBody: any = { name, email, cpfCnpj };
          if (sanitizedPhone) createBody.mobilePhone = sanitizedPhone;
          result = await asaasFetch(baseUrl, apiKey, '/customers', 'POST', createBody);
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

          if (orderId) {
            await supabase
              .from('orders')
              .update({ asaas_payment_id: result.id, status: result.status || 'PENDING' })
              .eq('id', orderId);
          }
        }
        break;
      }

      // ─── 3. CREDIT CARD PAYMENT (transparent — card data sent directly) ───
      case 'create_card_payment': {
        const { customer, value, description, creditCard, creditCardHolderInfo, installmentCount, orderId } = payload;
        const remoteIp = getRemoteIp(req);

        const parsedInstallmentCount = Number(installmentCount) || 1;

        // Recalcular valor com juros no backend (fonte da verdade)
        const { valorFinal, valorParcela } = calcularParcelamentoBackend(toCurrencyNumber(value), parsedInstallmentCount);

        const paymentBody: any = {
          customer,
          billingType: 'CREDIT_CARD',
          value: valorFinal,
          description,
          dueDate: new Date().toISOString().split('T')[0],
          externalReference: orderId || undefined,
          creditCard,
          creditCardHolderInfo,
          remoteIp,
        };

        if (parsedInstallmentCount > 1) {
          paymentBody.installmentCount = parsedInstallmentCount;
          paymentBody.installmentValue = valorParcela;
        }

        result = await asaasFetch(baseUrl, apiKey, '/payments', 'POST', paymentBody);

        // Update order with payment ID, status and final value with interest
        if (orderId && result.id) {
          await supabase
            .from('orders')
            .update({
              asaas_payment_id: result.id,
              status: result.status || 'PENDING',
              total_value: valorFinal,
            })
            .eq('id', orderId);
        }
        break;
      }

      // ─── 4. TOKENIZE CREDIT CARD (kept for future use if permission is enabled) ───
      case 'tokenize_credit_card': {
        const { customer: tokenCustomer, creditCard: tokenCreditCard, creditCardHolderInfo: tokenHolderInfo } = payload;
        const remoteIp = getRemoteIp(req);

        result = await asaasFetch(baseUrl, apiKey, '/creditCard/tokenizeCreditCard', 'POST', {
          customer: tokenCustomer,
          creditCard: tokenCreditCard,
          creditCardHolderInfo: tokenHolderInfo,
          remoteIp,
        });
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

      // ─── 7. SIMULATE INSTALLMENTS ───
      case 'simulate_installments': {
        const { value: simValue, installmentCount: simCount } = payload;
        try {
          const body: any = {
            value: toCurrencyNumber(simValue),
            billingTypes: ['CREDIT_CARD'],
          };
          if (simCount) body.installmentCount = Number(simCount);
          result = await asaasFetch(baseUrl, apiKey, '/payments/simulate', 'POST', body);
        } catch (simError: any) {
          // Simulation failures are non-critical — return empty result instead of throwing
          console.warn('Installment simulation failed:', simError.message);
          result = { creditCard: null, simulated: false, error: simError.message };
        }
        break;
      }

      case 'get_pix_qrcode': {
        const { paymentId } = payload;
        if (!paymentId) throw new Error('paymentId obrigatório');
        result = await asaasFetch(baseUrl, apiKey, `/payments/${paymentId}/pixQrCode`, 'GET');
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

    // Log failure to payment_logs table for admin diagnostics (skip non-payment actions)
    try {
      const bodyForLog = await req.clone().json().catch(() => ({}));
      const actionName = bodyForLog?.action || '';
      const isPaymentAction = actionName.includes('payment') || actionName.includes('card') || actionName.includes('pix');

      if (isPaymentAction) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        await sb.from('payment_logs').insert({
          error_message: error.message,
          error_source: 'backend',
          payment_method: actionName.includes('card') ? 'credit_card' : actionName.includes('pix') ? 'pix' : actionName,
          order_id: bodyForLog?.orderId || null,
          request_payload: { action: actionName, customer: bodyForLog?.customer },
        });
      }
    } catch { /* non-blocking */ }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});