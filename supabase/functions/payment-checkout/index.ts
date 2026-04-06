import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ────────────────────────────────────────────────────────
// Gateway Interface & Types
// ────────────────────────────────────────────────────────

interface PaymentResponse {
  id: string;
  status: string;
  pixQrCode?: { encodedImage: string; payload: string; expirationDate?: string };
  [key: string]: unknown;
}

interface CheckoutDTO {
  customer: string;
  value: number;
  description: string;
  orderId?: string;
  creditCard?: Record<string, string>;
  creditCardHolderInfo?: Record<string, string>;
  installmentCount?: number;
  installmentValue?: number;
  remoteIp?: string;
}

interface CustomerDTO {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
}

interface SimulationResult {
  valorFinal: number;
  valorParcela: number;
}

interface PaymentGateway {
  createCustomer(data: CustomerDTO): Promise<{ id: string }>;
  createPixPayment(dto: CheckoutDTO): Promise<PaymentResponse>;
  createCardPayment(dto: CheckoutDTO): Promise<PaymentResponse>;
  getPaymentStatus(paymentId: string): Promise<{ id: string; status: string }>;
  simulateInstallments(value: number, maxInstallments?: number): Promise<any>;
  testConnection(): Promise<{ success: boolean; [key: string]: unknown }>;
  refund(paymentId: string): Promise<void>;
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function toCurrencyNumber(value: number) {
  return Number(Number(value).toFixed(2));
}

function sanitizeDescription(desc?: string): string {
  if (!desc) return 'Pagamento';
  return desc.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ,.\-()]/g, '').trim() || 'Pagamento';
}

function sanitizePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return undefined;
  return digits;
}

function getRemoteIp(req: Request) {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    req.headers.get('x-real-ip'),
    req.headers.get('x-client-ip'),
    req.headers.get('fly-client-ip'),
  ];
  return candidates.find((ip) => typeof ip === 'string' && ip.length > 0 && ip.toLowerCase() !== 'unknown') ?? '127.0.0.1';
}

const DEFAULT_INTEREST_TABLE: Record<number, number> = {
  1: 0, 2: 0.05, 3: 0.07, 4: 0.09, 5: 0.12, 6: 0.15,
  7: 0.18, 8: 0.21, 9: 0.24, 10: 0.27, 11: 0.30, 12: 0.33,
};

// ────────────────────────────────────────────────────────
// ASAAS GATEWAY
// ────────────────────────────────────────────────────────

class AsaasGateway implements PaymentGateway {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, environment: string) {
    this.apiKey = apiKey;
    this.baseUrl = environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }

  private async fetch(path: string, method: string, body?: any) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'access_token': this.apiKey },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await res.text();
    let data: any = {};
    if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw }; } }
    if (!res.ok) {
      const joined = Array.isArray(data?.errors) ? data.errors.map((i: any) => i?.description).filter(Boolean).join(' | ') : '';
      throw new Error(joined || data?.message || `Asaas error [${res.status}]`);
    }
    return data;
  }

  async createCustomer(dto: CustomerDTO) {
    const sanitizedPhone = sanitizePhone(dto.phone);
    const existing = await this.fetch(`/customers?cpfCnpj=${dto.cpfCnpj}`, 'GET');
    if (existing?.data?.length > 0) {
      const id = existing.data[0].id;
      const updateBody: any = { name: dto.name, email: dto.email };
      if (sanitizedPhone) updateBody.mobilePhone = sanitizedPhone;
      const result = await this.fetch(`/customers/${id}`, 'PUT', updateBody);
      return { id: result.id };
    }
    const createBody: any = { name: dto.name, email: dto.email, cpfCnpj: dto.cpfCnpj };
    if (sanitizedPhone) createBody.mobilePhone = sanitizedPhone;
    const result = await this.fetch('/customers', 'POST', createBody);
    return { id: result.id };
  }

  async createPixPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const result = await this.fetch('/payments', 'POST', {
      customer: dto.customer,
      billingType: 'PIX',
      value: toCurrencyNumber(dto.value),
      description: sanitizeDescription(dto.description),
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      externalReference: dto.orderId || undefined,
    });
    if (result.id) {
      const pixData = await this.fetch(`/payments/${result.id}/pixQrCode`, 'GET');
      result.pixQrCode = pixData;
    }
    return result;
  }

  async createCardPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const parsedCount = Number(dto.installmentCount) || 1;
    const { valorFinal, valorParcela } = await this.simulateInstallmentsInternal(toCurrencyNumber(dto.value), parsedCount);

    const paymentBody: any = {
      customer: dto.customer,
      billingType: 'CREDIT_CARD',
      value: valorFinal,
      description: sanitizeDescription(dto.description),
      dueDate: new Date().toISOString().split('T')[0],
      externalReference: dto.orderId || undefined,
      creditCard: dto.creditCard,
      creditCardHolderInfo: dto.creditCardHolderInfo,
      remoteIp: dto.remoteIp,
    };
    if (parsedCount > 1) {
      paymentBody.installmentCount = parsedCount;
      paymentBody.installmentValue = valorParcela;
    }
    return await this.fetch('/payments', 'POST', paymentBody);
  }

  async getPaymentStatus(paymentId: string) {
    return await this.fetch(`/payments/${paymentId}`, 'GET');
  }

  async simulateInstallments(value: number, maxInstallments?: number) {
    try {
      const body: any = { value: toCurrencyNumber(value), billingTypes: ['CREDIT_CARD'] };
      if (maxInstallments) body.installmentCount = maxInstallments;
      return await this.fetch('/payments/simulate', 'POST', body);
    } catch (e: any) {
      console.warn('Asaas simulation failed:', e.message);
      return { creditCard: null, simulated: false, error: e.message };
    }
  }

  async testConnection() {
    const data = await this.fetch('/finance/getCurrentBalance', 'GET');
    return { success: true, walletId: data?.walletId || null, balance: data?.totalBalance ?? null };
  }

  async refund(paymentId: string) {
    await this.fetch(`/payments/${paymentId}/refund`, 'POST', {});
  }

  private async simulateInstallmentsInternal(valorBase: number, parcelas: number): Promise<SimulationResult> {
    if (parcelas < 1 || parcelas > 12) throw new Error(`Parcelas inválidas: ${parcelas}`);
    if (parcelas === 1) return { valorFinal: toCurrencyNumber(valorBase), valorParcela: toCurrencyNumber(valorBase) };
    try {
      const simResult = await this.fetch('/payments/simulate', 'POST', {
        value: toCurrencyNumber(valorBase), installmentCount: parcelas, billingTypes: ['CREDIT_CARD'],
      });
      const installments = simResult?.creditCard?.installments;
      if (Array.isArray(installments)) {
        const match = installments.find((i: any) => i.installmentCount === parcelas);
        if (match) return { valorFinal: toCurrencyNumber(match.totalValue), valorParcela: toCurrencyNumber(match.installmentValue) };
      }
    } catch (e) { console.warn('Asaas sim fallback:', (e as Error).message); }
    const pct = DEFAULT_INTEREST_TABLE[parcelas] ?? 0;
    const vf = toCurrencyNumber(valorBase * (1 + pct));
    return { valorFinal: vf, valorParcela: toCurrencyNumber(vf / parcelas) };
  }
}

// ────────────────────────────────────────────────────────
// MERCADO PAGO GATEWAY
// ────────────────────────────────────────────────────────

class MercadoPagoGateway implements PaymentGateway {
  private accessToken: string;
  private baseUrl = 'https://api.mercadopago.com';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch(path: string, method: string, body?: any) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await res.text();
    let data: any = {};
    if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw }; } }
    if (!res.ok) {
      const msg = data?.message || data?.cause?.[0]?.description || `MercadoPago error [${res.status}]`;
      throw new Error(msg);
    }
    return data;
  }

  async createCustomer(dto: CustomerDTO) {
    // Search existing by email
    const search = await this.fetch(`/v1/customers/search?email=${encodeURIComponent(dto.email)}`, 'GET');
    if (search?.results?.length > 0) {
      return { id: search.results[0].id };
    }
    const result = await this.fetch('/v1/customers', 'POST', {
      email: dto.email,
      first_name: dto.name.split(' ')[0],
      last_name: dto.name.split(' ').slice(1).join(' ') || dto.name.split(' ')[0],
      identification: { type: 'CPF', number: dto.cpfCnpj },
      phone: dto.phone ? { area_code: dto.phone.slice(0, 2), number: dto.phone.slice(2) } : undefined,
    });
    return { id: result.id };
  }

  async createPixPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const result = await this.fetch('/v1/payments', 'POST', {
      transaction_amount: toCurrencyNumber(dto.value),
      description: sanitizeDescription(dto.description),
      payment_method_id: 'pix',
      payer: { email: (dto.creditCardHolderInfo as any)?.email || 'customer@email.com' },
      external_reference: dto.orderId || undefined,
    });

    // Build compatible pixQrCode response
    const pixInfo = result.point_of_interaction?.transaction_data;
    return {
      id: String(result.id),
      status: this.mapStatus(result.status),
      pixQrCode: pixInfo ? {
        encodedImage: pixInfo.qr_code_base64 || '',
        payload: pixInfo.qr_code || '',
        expirationDate: result.date_of_expiration,
      } : undefined,
    };
  }

  async createCardPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const parsedCount = Number(dto.installmentCount) || 1;

    if (!dto.creditCard || !(dto.creditCard as any).token) {
      throw new Error('Mercado Pago requer tokenização do cartão via SDK JavaScript no frontend.');
    }

    const payerName = dto.creditCardHolderInfo?.name || '';
    const nameParts = payerName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const cpfNumber = (dto.creditCardHolderInfo?.cpfCnpj || '').replace(/\D/g, '');
    const phoneDigits = sanitizePhone(dto.creditCardHolderInfo?.phone);

    // Build additional_info with proper string types per MP docs
    const additionalInfoRaw = (dto as any).additionalInfo;
    const additionalInfo: any = {
      items: additionalInfoRaw?.items?.map((item: any) => ({
        id: String(item.id || 'item'),
        title: sanitizeDescription(item.title),
        quantity: String(item.quantity || 1),
        unit_price: String(toCurrencyNumber(item.unit_price || dto.value)),
        category_id: 'others',
      })) || [{
        id: dto.orderId || 'item',
        title: sanitizeDescription(dto.description),
        quantity: '1',
        unit_price: String(toCurrencyNumber(dto.value)),
        category_id: 'others',
      }],
      payer: {
        first_name: firstName,
        last_name: lastName,
        phone: phoneDigits ? {
          area_code: phoneDigits.slice(0, 2),
          number: phoneDigits.slice(2),
        } : undefined,
        address: additionalInfoRaw?.payer?.address ? {
          zip_code: String(additionalInfoRaw.payer.address.zip_code || ''),
          street_name: String(additionalInfoRaw.payer.address.street_name || ''),
          street_number: String(additionalInfoRaw.payer.address.street_number || ''),
        } : undefined,
      },
      shipments: additionalInfoRaw?.shipments ? {
        receiver_address: {
          zip_code: String(additionalInfoRaw.shipments.receiver_address?.zip_code || ''),
          street_name: String(additionalInfoRaw.shipments.receiver_address?.street_name || ''),
          street_number: String(additionalInfoRaw.shipments.receiver_address?.street_number || ''),
          city_name: String(additionalInfoRaw.shipments.receiver_address?.city_name || ''),
          state_name: String(additionalInfoRaw.shipments.receiver_address?.state_name || ''),
        },
      } : undefined,
    };

    const paymentBody: any = {
      // Required fields per MP docs
      transaction_amount: toCurrencyNumber(dto.value),
      token: (dto.creditCard as any).token,
      installments: parsedCount,
      payer: {
        email: dto.creditCardHolderInfo?.email || 'customer@email.com',
        first_name: firstName,
        last_name: lastName,
        identification: cpfNumber ? {
          type: 'CPF',
          number: cpfNumber,
        } : undefined,
        phone: phoneDigits ? {
          area_code: phoneDigits.slice(0, 2),
          number: phoneDigits.slice(2),
        } : undefined,
        address: (additionalInfoRaw?.payer?.address || dto.creditCardHolderInfo?.postalCode) ? {
          zip_code: String(additionalInfoRaw?.payer?.address?.zip_code || dto.creditCardHolderInfo?.postalCode || ''),
          street_name: String(additionalInfoRaw?.payer?.address?.street_name || ''),
          street_number: String(additionalInfoRaw?.payer?.address?.street_number || dto.creditCardHolderInfo?.addressNumber || ''),
        } : undefined,
      },
      description: sanitizeDescription(dto.description),
      external_reference: dto.orderId || undefined,
      // binary_mode: immediate approve/reject, no "in_process"
      binary_mode: true,
      // statement_descriptor: appears on buyer's card statement (max 22 chars)
      statement_descriptor: 'LOJA ONLINE',
      // capture: true ensures payment is captured immediately
      capture: true,
      // additional_info for antifraude scoring
      additional_info: additionalInfo,
    };

    // payment_method_id and issuer_id from frontend SDK (required per docs)
    if ((dto as any).paymentMethodId) {
      paymentBody.payment_method_id = (dto as any).paymentMethodId;
    }
    if ((dto as any).issuerId) {
      paymentBody.issuer_id = Number((dto as any).issuerId);
    }

    console.log('[MercadoPago] Card payment body:', JSON.stringify({
      transaction_amount: paymentBody.transaction_amount,
      installments: paymentBody.installments,
      binary_mode: paymentBody.binary_mode,
      payment_method_id: paymentBody.payment_method_id || 'NOT_SET',
      issuer_id: paymentBody.issuer_id || 'NOT_SET',
      has_additional_info: true,
      items_count: additionalInfo.items?.length,
      payer_email: paymentBody.payer.email,
      has_identification: !!paymentBody.payer.identification,
      has_payer_phone: !!paymentBody.payer.phone,
      has_payer_address: !!paymentBody.payer.address,
    }));

    const result = await this.fetch('/v1/payments', 'POST', paymentBody);

    // Log MP response details for diagnostics
    if (result.status_detail) {
      console.log(`[MercadoPago] Payment result: status=${result.status}, detail=${result.status_detail}, id=${result.id}`);
    }

    return {
      id: String(result.id),
      status: this.mapStatus(result.status),
      statusDetail: result.status_detail,
    };
  }

  async getPaymentStatus(paymentId: string) {
    const result = await this.fetch(`/v1/payments/${paymentId}`, 'GET');
    return { id: String(result.id), status: this.mapStatus(result.status) };
  }

  async simulateInstallments(value: number, _maxInstallments?: number) {
    // MercadoPago doesn't have a simulation endpoint like Asaas
    // Calculate locally with standard rates
    const max = Math.min(_maxInstallments || 12, 12);
    const installments = [];
    for (let i = 1; i <= max; i++) {
      const pct = DEFAULT_INTEREST_TABLE[i] ?? 0;
      const total = toCurrencyNumber(value * (1 + pct));
      installments.push({
        installmentCount: i,
        installmentValue: toCurrencyNumber(total / i),
        totalValue: total,
      });
    }
    return { creditCard: { installments } };
  }

  async testConnection() {
    const data = await this.fetch('/users/me', 'GET');
    return { success: true, userId: data?.id, nickname: data?.nickname };
  }

  async refund(paymentId: string) {
    await this.fetch(`/v1/payments/${paymentId}/refunds`, 'POST', {});
  }

  private mapStatus(mpStatus: string): string {
    const map: Record<string, string> = {
      approved: 'CONFIRMED',
      pending: 'PENDING',
      authorized: 'PENDING',
      in_process: 'PENDING',
      in_mediation: 'PENDING',
      rejected: 'DECLINED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      charged_back: 'CHARGEBACK',
    };
    return map[mpStatus] || 'PENDING';
  }
}

// ────────────────────────────────────────────────────────
// PAYMENT FACTORY
// ────────────────────────────────────────────────────────

async function createGateway(supabaseUrl: string, supabaseKey: string): Promise<{ gateway: PaymentGateway; gatewayName: string }> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read which gateway is active
  const { data: gwRow } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'payment_gateway')
    .maybeSingle();

  const gatewayName = gwRow?.value || 'asaas';

  if (gatewayName === 'mercadopago') {
    // Read environment
    const { data: mpEnvRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'mercadopago_environment')
      .maybeSingle();
    const mpEnv = mpEnvRow?.value || 'sandbox';

    // Read env-specific access token (with fallback to generic key)
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

    if (!accessToken) throw new Error('Access Token do Mercado Pago não configurado');
    console.log(`[PaymentFactory] Using MercadoPago gateway (env: ${mpEnv})`);
    return { gateway: new MercadoPagoGateway(accessToken), gatewayName };
  }

  // Default: Asaas
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

  if (!apiKeyRow?.value) throw new Error('Asaas API Key não configurada');
  return { gateway: new AsaasGateway(apiKeyRow.value, envRow?.value || 'sandbox'), gatewayName };
}

// ────────────────────────────────────────────────────────
// MAIN HANDLER
// ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, ...payload } = body;

    console.log(`[payment-checkout] Action: ${action} | Gateway resolving...`);
    console.log(`[payment-checkout] Payload keys: ${Object.keys(payload).join(', ')}`);

    // Log detailed payload for card payments (mask sensitive data)
    if (action === 'create_card_payment') {
      console.log('[payment-checkout] Card payment details:', JSON.stringify({
        orderId: payload.orderId,
        value: payload.value,
        installmentCount: payload.installmentCount,
        paymentMethodId: payload.paymentMethodId || 'NOT_SET',
        issuerId: payload.issuerId || 'NOT_SET',
        hasToken: !!(payload.creditCard?.token),
        tokenPreview: payload.creditCard?.token ? payload.creditCard.token.substring(0, 8) + '...' : null,
        payerEmail: payload.creditCardHolderInfo?.email || 'NOT_SET',
        description: payload.description,
      }));
    }

    if (action === 'create_pix_payment') {
      console.log('[payment-checkout] PIX payment details:', JSON.stringify({
        orderId: payload.orderId,
        value: payload.value,
        payerEmail: payload.creditCardHolderInfo?.email || 'NOT_SET',
        description: payload.description,
      }));
    }

    const { gateway, gatewayName } = await createGateway(supabaseUrl, supabaseKey);
    console.log(`[payment-checkout] Gateway resolved: ${gatewayName}`);

    let result;

    switch (action) {
      case 'test_connection': {
        const data = await gateway.testConnection();
        result = { ...data, gateway: gatewayName };
        break;
      }

      case 'create_customer': {
        result = await gateway.createCustomer({
          name: payload.name,
          email: payload.email,
          cpfCnpj: payload.cpfCnpj,
          phone: payload.phone,
        });
        break;
      }

      case 'create_pix_payment': {
        const { customer, value, description, orderId } = payload;
        result = await gateway.createPixPayment({ customer, value, description, orderId, creditCardHolderInfo: payload.creditCardHolderInfo });

        if (orderId && result.id) {
          await supabase.from('orders').update({
            asaas_payment_id: result.id,
            status: result.status || 'PENDING',
          }).eq('id', orderId);
        }
        break;
      }

      case 'create_card_payment': {
        const { customer, value, description, creditCard, creditCardHolderInfo, installmentCount, orderId, paymentMethodId, issuerId } = payload;
        const remoteIp = getRemoteIp(req);

        const cardDto: any = {
          customer, value, description, creditCard, creditCardHolderInfo,
          installmentCount, orderId, remoteIp,
          paymentMethodId, issuerId,
        };
        result = await gateway.createCardPayment(cardDto);

        if (orderId && result.id) {
          // For Asaas, the total_value is updated inside the gateway; for MP we update here
          const updateData: any = {
            asaas_payment_id: result.id,
            status: result.status || 'PENDING',
          };
          if (gatewayName === 'mercadopago') {
            updateData.total_value = toCurrencyNumber(value);
          }
          await supabase.from('orders').update(updateData).eq('id', orderId);
        }
        break;
      }

      case 'get_payment_status': {
        result = await gateway.getPaymentStatus(payload.paymentId);
        break;
      }

      case 'simulate_installments': {
        result = await gateway.simulateInstallments(payload.value, payload.installmentCount);
        break;
      }

      case 'refund': {
        await gateway.refund(payload.paymentId);
        result = { success: true };
        break;
      }

      case 'get_pix_qrcode': {
        // Only Asaas needs this as a separate call; MP returns it inline
        if (gatewayName === 'asaas') {
          const asaasGw = gateway as AsaasGateway;
          result = await (asaasGw as any).fetch(`/payments/${payload.paymentId}/pixQrCode`, 'GET');
        } else {
          const paymentData = await gateway.getPaymentStatus(payload.paymentId);
          result = paymentData;
        }
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

    // Log failure for diagnostics
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
