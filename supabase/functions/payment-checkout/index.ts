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

async function getSiteSetting(supabase: ReturnType<typeof createClient>, key: string) {
  const { data } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
  return data?.value || '';
}

function normalizePublicBaseUrl(url?: string | null) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

function buildAccountUrl(baseUrl?: string | null) {
  const normalized = normalizePublicBaseUrl(baseUrl);
  return normalized ? `${normalized}/minha-conta` : '';
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
  private notificationUrl?: string;
  private currentDeviceSessionId?: string;

  constructor(accessToken: string, notificationUrl?: string) {
    this.accessToken = accessToken;
    this.notificationUrl = notificationUrl;
  }

  setDeviceSessionId(id: string) {
    this.currentDeviceSessionId = id;
  }

  private async fetch(path: string, method: string, body?: any) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'X-Idempotency-Key': crypto.randomUUID(),
    };
    if (this.currentDeviceSessionId) {
      headers['X-meli-session-id'] = this.currentDeviceSessionId;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
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
    const payerName = dto.creditCardHolderInfo?.name || '';
    const nameParts = payerName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const cpfNumber = (dto.creditCardHolderInfo?.cpfCnpj || '').replace(/\D/g, '');
    const phoneDigits = sanitizePhone(dto.creditCardHolderInfo?.phone);
    const additionalInfoRaw = (dto as any).additionalInfo;

    const paymentBody: any = {
      transaction_amount: toCurrencyNumber(dto.value),
      description: sanitizeDescription(dto.description),
      payment_method_id: 'pix',
      payer: {
        email: dto.creditCardHolderInfo?.email || 'customer@email.com',
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        identification: cpfNumber ? { type: 'CPF', number: cpfNumber } : undefined,
        phone: phoneDigits ? { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) } : undefined,
        address: (additionalInfoRaw?.payer?.address || dto.creditCardHolderInfo?.postalCode) ? {
          zip_code: String(additionalInfoRaw?.payer?.address?.zip_code || dto.creditCardHolderInfo?.postalCode || ''),
          street_name: String(additionalInfoRaw?.payer?.address?.street_name || ''),
          street_number: String(additionalInfoRaw?.payer?.address?.street_number || dto.creditCardHolderInfo?.addressNumber || ''),
        } : undefined,
      },
      external_reference: dto.orderId || undefined,
      notification_url: this.notificationUrl || undefined,
    };

    // additional_info for antifraude scoring (same structure as card payments)
    if (additionalInfoRaw) {
      paymentBody.additional_info = {
        ip_address: dto.remoteIp || undefined,
        items: additionalInfoRaw.items?.map((item: any) => ({
          id: String(item.id || 'item'),
          title: sanitizeDescription(item.title),
          description: sanitizeDescription(item.description || item.title),
          picture_url: item.picture_url || null,
          quantity: String(item.quantity || 1),
          unit_price: String(toCurrencyNumber(item.unit_price || dto.value)),
          category_id: 'others',
        })),
        payer: {
          first_name: firstName,
          last_name: lastName,
          phone: phoneDigits ? { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) } : undefined,
          address: additionalInfoRaw.payer?.address ? {
            zip_code: String(additionalInfoRaw.payer.address.zip_code || ''),
            street_name: String(additionalInfoRaw.payer.address.street_name || ''),
            street_number: String(additionalInfoRaw.payer.address.street_number || ''),
          } : undefined,
        },
        shipments: additionalInfoRaw.shipments ? {
          receiver_address: {
            zip_code: String(additionalInfoRaw.shipments.receiver_address?.zip_code || ''),
            street_name: String(additionalInfoRaw.shipments.receiver_address?.street_name || ''),
            street_number: String(additionalInfoRaw.shipments.receiver_address?.street_number || ''),
            city_name: String(additionalInfoRaw.shipments.receiver_address?.city_name || ''),
            state_name: String(additionalInfoRaw.shipments.receiver_address?.state_name || ''),
          },
        } : undefined,
      };
    }

    console.log('[MercadoPago] PIX payment body:', JSON.stringify({
      transaction_amount: paymentBody.transaction_amount,
      payer_email: paymentBody.payer.email,
      has_additional_info: !!paymentBody.additional_info,
      has_identification: !!paymentBody.payer.identification,
      has_notification_url: !!paymentBody.notification_url,
      has_ip_address: !!paymentBody.additional_info?.ip_address,
    }));

    const result = await this.fetch('/v1/payments', 'POST', paymentBody);

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
      ip_address: dto.remoteIp || undefined,
      items: additionalInfoRaw?.items?.map((item: any) => ({
        id: String(item.id || 'item'),
        title: sanitizeDescription(item.title),
        description: sanitizeDescription(item.description || item.title),
        picture_url: item.picture_url || null,
        quantity: String(item.quantity || 1),
        unit_price: String(toCurrencyNumber(item.unit_price || dto.value)),
        category_id: 'others',
      })) || [{
        id: dto.orderId || 'item',
        title: sanitizeDescription(dto.description),
        description: sanitizeDescription(dto.description),
        picture_url: null,
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
      notification_url: this.notificationUrl || undefined,
      // binary_mode: false allows payments to go to "in_process" for manual review
      // instead of immediate rejection, increasing approval rates
      binary_mode: false,
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
      has_ip_address: !!additionalInfo.ip_address,
      has_notification_url: !!paymentBody.notification_url,
      has_device_session_id: !!this.currentDeviceSessionId,
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
      mpStatus: result.status, // raw MP status for frontend (e.g. 'in_process', 'approved')
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
      in_process: 'IN_REVIEW',
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
// PAGBANK GATEWAY
// ────────────────────────────────────────────────────────

class PagBankGateway implements PaymentGateway {
  public token: string;
  public baseUrl: string;

  constructor(token: string, environment: string) {
    this.token = token;
    this.baseUrl = environment === 'production'
      ? 'https://api.pagseguro.com'
      : 'https://sandbox.api.pagseguro.com';
  }

  private async fetch(path: string, method: string, body?: any) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await res.text();
    let data: any = {};
    if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw }; } }
    if (!res.ok) {
      const msgs = Array.isArray(data?.error_messages)
        ? data.error_messages.map((e: any) => e?.description || e?.message).filter(Boolean).join(' | ')
        : '';
      throw new Error(msgs || data?.message || `PagBank error [${res.status}]`);
    }
    return data;
  }

  async createCustomer(dto: CustomerDTO) {
    // PagBank doesn't have a standalone customer API like Asaas.
    // Customer is sent inline with the order. Return a placeholder.
    return { id: `pb_${dto.cpfCnpj}` };
  }

  async createPixPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const cpf = (dto.creditCardHolderInfo?.cpfCnpj || '').replace(/\D/g, '');
    const phoneDigits = sanitizePhone(dto.creditCardHolderInfo?.phone);
    const payload: any = {
      reference_id: dto.orderId || crypto.randomUUID(),
      customer: {
        name: dto.creditCardHolderInfo?.name || 'Cliente',
        email: dto.creditCardHolderInfo?.email || 'customer@email.com',
        tax_id: cpf,
        phones: phoneDigits ? [{ country: '55', area: phoneDigits.slice(0, 2), number: phoneDigits.slice(2), type: 'MOBILE' }] : [],
      },
      items: [{
        reference_id: dto.orderId || 'item',
        name: sanitizeDescription(dto.description),
        quantity: 1,
        unit_amount: Math.round(toCurrencyNumber(dto.value) * 100),
      }],
      qr_codes: [{
        amount: { value: Math.round(toCurrencyNumber(dto.value) * 100) },
        expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }],
      notification_urls: [`${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`],
    };

    const result = await this.fetch('/orders', 'POST', payload);
    const qr = result.qr_codes?.[0];
    return {
      id: result.id,
      status: this.mapStatus(result.charges?.[0]?.status || 'WAITING'),
      pixQrCode: qr ? {
        encodedImage: qr.links?.find((l: any) => l.media === 'image/png')?.href || '',
        payload: qr.text || '',
        expirationDate: qr.expiration_date,
      } : undefined,
    };
  }

  async createCardPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const parsedCount = Number(dto.installmentCount) || 1;
    const cpf = (dto.creditCardHolderInfo?.cpfCnpj || '').replace(/\D/g, '');
    const phoneDigits = sanitizePhone(dto.creditCardHolderInfo?.phone);

    const { valorFinal, valorParcela } = this.simulateInstallmentsLocal(toCurrencyNumber(dto.value), parsedCount);

    const payload: any = {
      reference_id: dto.orderId || crypto.randomUUID(),
      customer: {
        name: dto.creditCardHolderInfo?.name || 'Cliente',
        email: dto.creditCardHolderInfo?.email || 'customer@email.com',
        tax_id: cpf,
        phones: phoneDigits ? [{ country: '55', area: phoneDigits.slice(0, 2), number: phoneDigits.slice(2), type: 'MOBILE' }] : [],
      },
      items: [{
        reference_id: dto.orderId || 'item',
        name: sanitizeDescription(dto.description),
        quantity: 1,
        unit_amount: Math.round(valorFinal * 100),
      }],
      charges: [{
        reference_id: dto.orderId || crypto.randomUUID(),
        description: sanitizeDescription(dto.description),
        amount: {
          value: Math.round(valorFinal * 100),
          currency: 'BRL',
        },
        payment_method: {
          type: 'CREDIT_CARD',
          installments: parsedCount,
          capture: true,
          card: {
            encrypted: (dto.creditCard as any)?.encrypted || (dto.creditCard as any)?.token,
          },
        },
      }],
      notification_urls: [`${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`],
    };

    console.log('[PagBank] Card payment:', JSON.stringify({
      reference_id: payload.reference_id,
      amount: payload.charges[0].amount.value,
      installments: parsedCount,
    }));

    const result = await this.fetch('/orders', 'POST', payload);
    const charge = result.charges?.[0];
    return {
      id: result.id,
      status: this.mapStatus(charge?.status || 'WAITING'),
    };
  }

  async getPaymentStatus(paymentId: string) {
    const result = await this.fetch(`/orders/${paymentId}`, 'GET');
    const charge = result.charges?.[0];
    return { id: result.id, status: this.mapStatus(charge?.status || 'WAITING') };
  }

  async simulateInstallments(value: number, maxInstallments?: number) {
    const max = Math.min(maxInstallments || 12, 12);
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
    // Validate credentials by calling /public-keys endpoint.
    try {
      const res = await fetch(`${this.baseUrl}/public-keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'card' }),
      });

      // 401/403 means bad credentials — check FIRST before anything else
      if (res.status === 401 || res.status === 403) {
        throw new Error('Token inválido ou sem permissão');
      }

      // Any other response (2xx or structured 4xx error) means the token is valid
      await res.text(); // consume body
      return { success: true };
    } catch (e: any) {
      if (e.message.includes('inválido') || e.message.includes('permissão')) throw e;
      throw new Error(`Falha ao conectar com PagBank: ${e.message}`);
    }
  }

  async refund(paymentId: string) {
    // Get order to find charge ID
    const order = await this.fetch(`/orders/${paymentId}`, 'GET');
    const chargeId = order.charges?.[0]?.id;
    if (!chargeId) throw new Error('Charge não encontrada para reembolso');
    await this.fetch(`/charges/${chargeId}/cancel`, 'POST', {
      amount: { value: order.charges[0].amount.value },
    });
  }

  private mapStatus(pbStatus: string): string {
    const map: Record<string, string> = {
      PAID: 'CONFIRMED',
      AUTHORIZED: 'PENDING',
      IN_ANALYSIS: 'IN_REVIEW',
      DECLINED: 'DECLINED',
      CANCELED: 'CANCELLED',
      WAITING: 'PENDING',
    };
    return map[pbStatus] || 'PENDING';
  }

  private simulateInstallmentsLocal(valorBase: number, parcelas: number): SimulationResult {
    if (parcelas <= 1) return { valorFinal: valorBase, valorParcela: valorBase };
    const pct = DEFAULT_INTEREST_TABLE[parcelas] ?? 0;
    const vf = toCurrencyNumber(valorBase * (1 + pct));
    return { valorFinal: vf, valorParcela: toCurrencyNumber(vf / parcelas) };
  }
}

// ────────────────────────────────────────────────────────
// PAGAR.ME GATEWAY (v5)
// ────────────────────────────────────────────────────────

class PagarMeGateway implements PaymentGateway {
  public secretKey: string;
  private baseUrl = 'https://api.pagar.me/core/v5';
  private authHeader: string;
  private antifraudEnabled: boolean;

  constructor(secretKey: string, antifraudEnabled = true) {
    this.secretKey = secretKey;
    this.antifraudEnabled = antifraudEnabled;
    // Pagar.me uses Basic auth with secret key as username and empty password
    this.authHeader = 'Basic ' + btoa(`${secretKey}:`);
  }

  private async fetch(path: string, method: string, body?: any) {
    const startedAt = Date.now();
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': this.authHeader,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const elapsedMs = Date.now() - startedAt;
    const raw = await res.text();
    let data: any = {};
    if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw }; } }

    // Build a compact, safe preview of the response (truncated to 800 chars)
    const preview = raw ? raw.slice(0, 800) : '';
    const previewSuffix = raw && raw.length > 800 ? `... (+${raw.length - 800} chars)` : '';

    if (!res.ok) {
      console.error(
        `[Pagar.me] ${method} ${path} -> ${res.status} ${res.statusText} (${elapsedMs}ms) | response: ${preview}${previewSuffix}`,
      );
      const errs = data?.errors;
      let msg = data?.message || `Pagar.me error [${res.status}]`;
      if (errs && typeof errs === 'object') {
        const flat: string[] = [];
        for (const k of Object.keys(errs)) {
          const v = errs[k];
          if (Array.isArray(v)) flat.push(...v);
          else if (typeof v === 'string') flat.push(v);
        }
        if (flat.length) msg = flat.join(' | ');
      }
      throw new Error(msg);
    }

    // Success: log a compact summary including the preview for traceability
    const summary: any = { status: res.status, elapsed_ms: elapsedMs };
    if (data?.id) summary.id = data.id;
    if (data?.status) summary.order_status = data.status;
    const charge = Array.isArray(data?.charges) ? data.charges[0] : undefined;
    if (charge?.status) summary.charge_status = charge.status;
    const lastTx = charge?.last_transaction;
    if (lastTx) {
      summary.tx_status = lastTx.status;
      summary.has_qr_code = !!lastTx.qr_code;
      summary.has_qr_code_url = !!lastTx.qr_code_url;
      if (lastTx.acquirer_message) summary.acquirer_message = lastTx.acquirer_message;
    }
    console.log(
      `[Pagar.me] ${method} ${path} -> ${res.status} (${elapsedMs}ms) | summary: ${JSON.stringify(summary)} | preview: ${preview}${previewSuffix}`,
    );

    return data;
  }


  async createCustomer(dto: CustomerDTO) {
    // Pagar.me v5: customer is created inline with the order, but we can pre-create
    const phoneDigits = sanitizePhone(dto.phone);
    const body: any = {
      name: dto.name,
      email: dto.email,
      type: dto.cpfCnpj.length > 11 ? 'company' : 'individual',
      document: dto.cpfCnpj,
      document_type: dto.cpfCnpj.length > 11 ? 'cnpj' : 'cpf',
    };
    if (phoneDigits) {
      body.phones = {
        mobile_phone: {
          country_code: '55',
          area_code: phoneDigits.slice(0, 2),
          number: phoneDigits.slice(2),
        },
      };
    }
    try {
      const result = await this.fetch('/customers', 'POST', body);
      return { id: result.id };
    } catch (e: any) {
      // If customer already exists, return a placeholder id (Pagar.me handles it inline)
      console.warn('[Pagar.me] createCustomer fallback:', e.message);
      return { id: `pgme_${dto.cpfCnpj}` };
    }
  }

  private buildCustomerObj(dto: CheckoutDTO) {
    const cpfCnpj = (dto.creditCardHolderInfo?.cpfCnpj || '').replace(/\D/g, '');
    const phoneDigits = sanitizePhone(dto.creditCardHolderInfo?.phone);
    const customer: any = {
      name: dto.creditCardHolderInfo?.name || 'Cliente',
      email: dto.creditCardHolderInfo?.email || 'customer@email.com',
      type: cpfCnpj.length > 11 ? 'company' : 'individual',
      document: cpfCnpj,
      document_type: cpfCnpj.length > 11 ? 'cnpj' : 'cpf',
    };
    if (phoneDigits) {
      customer.phones = {
        mobile_phone: {
          country_code: '55',
          area_code: phoneDigits.slice(0, 2),
          number: phoneDigits.slice(2),
        },
      };
    }
    return customer;
  }

  private buildItems(dto: CheckoutDTO, valueCents: number) {
    const additionalInfoRaw = (dto as any).additionalInfo;
    if (additionalInfoRaw?.items?.length) {
      return additionalInfoRaw.items.map((it: any) => ({
        amount: Math.round(toCurrencyNumber(it.unit_price || dto.value) * 100),
        description: sanitizeDescription(it.title || dto.description),
        quantity: Number(it.quantity) || 1,
        code: String(it.id || dto.orderId || 'item'),
      }));
    }
    return [{
      amount: valueCents,
      description: sanitizeDescription(dto.description),
      quantity: 1,
      code: dto.orderId || 'item',
    }];
  }

  private extractAddress(dto: CheckoutDTO) {
    const additionalInfoRaw = (dto as any).additionalInfo;
    const addr = additionalInfoRaw?.shipments?.receiver_address || additionalInfoRaw?.payer?.address;
    if (!addr) return undefined;
    return {
      street: String(addr.street_name || addr.street || '').trim(),
      street_number: String(addr.street_number || addr.number || 'S/N').trim(),
      complement: String(addr.complement || '').trim() || undefined,
      neighborhood: String(addr.neighborhood || addr.district || 'Centro').trim(),
      zip_code: String(addr.zip_code || addr.postal_code || '').replace(/\D/g, ''),
      city: String(addr.city_name || addr.city || '').trim(),
      state: String(addr.state_name || addr.state || '').toUpperCase().slice(0, 2),
      country: 'BR',
    };
  }

  private buildAntifraud(dto: CheckoutDTO) {
    if (!this.antifraudEnabled) return undefined;
    const address = this.extractAddress(dto);
    if (!address) return undefined;
    return {
      shipping: {
        amount: 0,
        description: 'Frete',
        recipient_name: dto.creditCardHolderInfo?.name || 'Cliente',
        recipient_phone: sanitizePhone(dto.creditCardHolderInfo?.phone) || '11999999999',
        address,
      },
    };
  }

  async createPixPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const valueCents = Math.round(toCurrencyNumber(dto.value) * 100);
    const orderBody: any = {
      code: dto.orderId || crypto.randomUUID(),
      customer: this.buildCustomerObj(dto),
      items: this.buildItems(dto, valueCents),
      payments: [{
        payment_method: 'pix',
        pix: {
          expires_in: 86400, // 24h
          additional_information: [{ name: 'Pedido', value: dto.orderId || '' }],
        },
      }],
      ip: dto.remoteIp || undefined,
    };

    const antifraud = this.buildAntifraud(dto);
    if (antifraud) orderBody.antifraud_enabled = true;

    console.log('[Pagar.me] PIX order body:', JSON.stringify({
      code: orderBody.code,
      amount_cents: valueCents,
      customer_email: orderBody.customer.email,
      has_antifraud: !!antifraud,
    }));

    const result = await this.fetch('/orders', 'POST', orderBody);
    const charge = result.charges?.[0];
    const lastTx = charge?.last_transaction;

    return {
      id: result.id,
      status: this.mapStatus(charge?.status || result.status || 'pending'),
      pixQrCode: lastTx ? {
        encodedImage: lastTx.qr_code_url ? '' : '', // Pagar.me returns URL, not base64 inline
        payload: lastTx.qr_code || '',
        expirationDate: lastTx.expires_at,
      } : undefined,
      // Extra: send qr_code_url for direct rendering
      pixQrCodeUrl: lastTx?.qr_code_url,
    } as PaymentResponse;
  }

  async createCardPayment(dto: CheckoutDTO): Promise<PaymentResponse> {
    const parsedCount = Number(dto.installmentCount) || 1;
    const cardToken = (dto.creditCard as any)?.token;
    if (!cardToken) {
      throw new Error('Pagar.me requer tokenização do cartão via SDK no frontend.');
    }

    const valueCents = Math.round(toCurrencyNumber(dto.value) * 100);

    // Statement descriptor: max 13 chars, alphanumeric uppercase. Use fantasy_name when available.
    const rawDescriptor = ((dto as any).fantasyName || dto.description || 'LOJA').toString();
    const statementDescriptor = rawDescriptor
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .toUpperCase()
      .slice(0, 13)
      .trim() || 'LOJA';

    const billingAddress = this.extractAddress(dto);

    const cardConfig: any = {
      installments: parsedCount,
      statement_descriptor: statementDescriptor,
      card: {
        token: cardToken,
      },
      operation_type: 'auth_and_capture',
    };

    // Include billing_address inside card object — improves antifraud approval rate
    if (billingAddress) {
      cardConfig.card.billing_address = {
        line_1: `${billingAddress.street_number}, ${billingAddress.street}, ${billingAddress.neighborhood}`.slice(0, 256),
        line_2: billingAddress.complement || undefined,
        zip_code: billingAddress.zip_code,
        city: billingAddress.city,
        state: billingAddress.state,
        country: billingAddress.country,
      };
    }

    const orderBody: any = {
      code: dto.orderId || crypto.randomUUID(),
      customer: this.buildCustomerObj(dto),
      items: this.buildItems(dto, valueCents),
      payments: [{
        payment_method: 'credit_card',
        credit_card: cardConfig,
      }],
      ip: dto.remoteIp || undefined,
    };

    const antifraud = this.buildAntifraud(dto);
    if (antifraud) {
      orderBody.antifraud_enabled = true;
      orderBody.shipping = antifraud.shipping;
    }

    console.log('[Pagar.me] Card order body:', JSON.stringify({
      code: orderBody.code,
      amount_cents: valueCents,
      installments: parsedCount,
      statement_descriptor: statementDescriptor,
      has_antifraud: !!antifraud,
      has_billing_address: !!billingAddress,
      has_token: !!cardToken,
    }));

    const result = await this.fetch('/orders', 'POST', orderBody);
    const charge = result.charges?.[0];
    const lastTx = charge?.last_transaction;

    // If declined, surface acquirer message for better UX
    const chargeStatus = charge?.status || result.status || 'pending';
    if (chargeStatus === 'failed' || chargeStatus === 'not_authorized') {
      const acquirerMsg = lastTx?.acquirer_message || lastTx?.gateway_response?.errors?.[0]?.message;
      if (acquirerMsg) {
        throw new Error(`Cartão recusado: ${acquirerMsg}`);
      }
    }

    return {
      id: result.id,
      status: this.mapStatus(chargeStatus),
    };
  }

  async getPaymentStatus(paymentId: string) {
    const result = await this.fetch(`/orders/${paymentId}`, 'GET');
    const charge = result.charges?.[0];
    return { id: result.id, status: this.mapStatus(charge?.status || result.status || 'pending') };
  }

  async simulateInstallments(value: number, maxInstallments?: number) {
    const max = Math.min(maxInstallments || 12, 12);
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
    // Validate by listing recent orders (lightweight)
    const result = await this.fetch('/orders?size=1', 'GET');
    return { success: true, orderCount: result?.paging?.total ?? 0 };
  }

  async refund(paymentId: string) {
    const order = await this.fetch(`/orders/${paymentId}`, 'GET');
    const chargeId = order.charges?.[0]?.id;
    if (!chargeId) throw new Error('Charge não encontrada para reembolso');
    await this.fetch(`/charges/${chargeId}`, 'DELETE');
  }

  private mapStatus(s: string): string {
    const map: Record<string, string> = {
      paid: 'CONFIRMED',
      pending: 'PENDING',
      processing: 'PENDING',
      authorized_pending_capture: 'PENDING',
      waiting_capture: 'PENDING',
      not_authorized: 'DECLINED',
      failed: 'DECLINED',
      canceled: 'CANCELLED',
      refunded: 'REFUNDED',
      chargedback: 'CHARGEBACK',
      with_error: 'DECLINED',
      partial_canceled: 'REFUNDED',
    };
    return map[s] || 'PENDING';
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

  if (gatewayName === 'pagarme') {
    const { data: pgmeEnvRow } = await supabase
      .from('site_settings').select('value').eq('key', 'pagarme_environment').maybeSingle();
    const pgmeEnv = pgmeEnvRow?.value || 'sandbox';
    const { data: pgmeKeyRow } = await supabase
      .from('site_settings').select('value').eq('key', `pagarme_secret_key_${pgmeEnv}`).maybeSingle();
    let secretKey = pgmeKeyRow?.value;
    if (!secretKey) {
      const { data: fallback } = await supabase
        .from('site_settings').select('value').eq('key', 'pagarme_secret_key').maybeSingle();
      secretKey = fallback?.value;
    }
    if (!secretKey) throw new Error('Secret Key do Pagar.me não configurada');

    const { data: afRow } = await supabase
      .from('site_settings').select('value').eq('key', 'pagarme_antifraud_enabled').maybeSingle();
    const antifraud = (afRow?.value ?? 'true') !== 'false';

    console.log(`[PaymentFactory] Using Pagar.me gateway (env: ${pgmeEnv}, antifraud: ${antifraud})`);
    return { gateway: new PagarMeGateway(secretKey, antifraud), gatewayName };
  }

  if (gatewayName === 'pagbank') {
    const { data: pbTokenRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'pagbank_token')
      .maybeSingle();
    const { data: pbEnvRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'pagbank_environment')
      .maybeSingle();

    if (!pbTokenRow?.value) throw new Error('Token do PagBank não configurado');
    console.log(`[PaymentFactory] Using PagBank gateway (env: ${pbEnvRow?.value || 'sandbox'})`);
    return { gateway: new PagBankGateway(pbTokenRow.value, pbEnvRow?.value || 'sandbox'), gatewayName };
  }

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

    // Build webhook notification URL from Supabase URL
    const notificationUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

    console.log(`[PaymentFactory] Using MercadoPago gateway (env: ${mpEnv})`);
    return { gateway: new MercadoPagoGateway(accessToken, notificationUrl), gatewayName };
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
    const configuredPublicBaseUrl = await getSiteSetting(supabase, 'store_public_url');

    const body = await req.json();
    const { action, ...payload } = body;
    const fallbackRedirectUrl = payload.redirectUrl || buildAccountUrl(configuredPublicBaseUrl);

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

    // Set device session ID for anti-fraud (Mercado Pago only)
    if (gatewayName === 'mercadopago' && payload.deviceSessionId) {
      (gateway as MercadoPagoGateway).setDeviceSessionId(payload.deviceSessionId);
      console.log(`[payment-checkout] Device Session ID set: ${payload.deviceSessionId.substring(0, 12)}...`);
    }

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
        const remoteIpPix = getRemoteIp(req);
        const pixDto: any = { customer, value, description, orderId, creditCardHolderInfo: payload.creditCardHolderInfo, remoteIp: remoteIpPix };
        if (payload.additionalInfo) pixDto.additionalInfo = payload.additionalInfo;
        result = await gateway.createPixPayment(pixDto);

        if (orderId && result.id) {
          await supabase.from('orders').update({
            asaas_payment_id: result.id,
            status: result.status || 'PENDING',
          }).eq('id', orderId);
        }
        break;
      }

      case 'create_card_payment': {
        const { customer, value, description, creditCard, creditCardHolderInfo, installmentCount, orderId, paymentMethodId, issuerId, deviceSessionId } = payload;
        const remoteIp = getRemoteIp(req);

        const cardDto: any = {
          customer, value, description, creditCard, creditCardHolderInfo,
          installmentCount, orderId, remoteIp,
          paymentMethodId, issuerId,
        };
        if (payload.additionalInfo) cardDto.additionalInfo = payload.additionalInfo;
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

      case 'generate_pagbank_public_key': {
        const pbToken = payload.token;
        const pbEnv = payload.environment || 'sandbox';
        if (!pbToken) throw new Error('Token do PagBank não fornecido');
        const pbBase = pbEnv === 'production'
          ? 'https://api.pagseguro.com'
          : 'https://sandbox.api.pagseguro.com';
        
        // Try to get existing key first
        let pkRes = await fetch(`${pbBase}/public-keys/card`, {
          headers: { 'Authorization': `Bearer ${pbToken}` },
        });
        
        if (pkRes.status === 404) {
          // Create new key
          pkRes = await fetch(`${pbBase}/public-keys`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${pbToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'card' }),
          });
        }
        
        if (!pkRes.ok) {
          const errData = await pkRes.json().catch(() => ({}));
          throw new Error(errData.error_messages?.[0]?.description || `PagBank HTTP ${pkRes.status}`);
        }
        
        const pkData = await pkRes.json();
        if (!pkData.public_key) throw new Error('Resposta sem public_key');
        result = { public_key: pkData.public_key };
        break;
      }

      case 'create_mp_checkout': {
        // Mercado Pago Checkout Pro (redirect) — creates a preference and returns checkout URL
        const mpGw = gateway as MercadoPagoGateway;
        const mpAccessToken = (mpGw as any).accessToken;
        const cpfMp = (payload.creditCardHolderInfo?.cpfCnpj || '').replace(/\D/g, '');
        const phoneDigitsMp = sanitizePhone(payload.creditCardHolderInfo?.phone);
        const mpPayerName = payload.creditCardHolderInfo?.name || 'Cliente';
        const mpNameParts = mpPayerName.split(' ');

        const preferenceBody: any = {
          items: [{
            id: payload.orderId || 'item',
            title: sanitizeDescription(payload.description),
            quantity: payload.quantity || 1,
            unit_price: toCurrencyNumber(payload.value / (payload.quantity || 1)),
            currency_id: 'BRL',
          }],
          payer: {
            name: mpNameParts[0] || '',
            surname: mpNameParts.slice(1).join(' ') || mpNameParts[0] || '',
            email: payload.creditCardHolderInfo?.email || 'customer@email.com',
            identification: cpfMp ? { type: 'CPF', number: cpfMp } : undefined,
            phone: phoneDigitsMp ? { area_code: phoneDigitsMp.slice(0, 2), number: phoneDigitsMp.slice(2) } : undefined,
          },
          back_urls: {
            success: fallbackRedirectUrl,
            failure: fallbackRedirectUrl,
            pending: fallbackRedirectUrl,
          },
          auto_return: 'approved',
          external_reference: payload.orderId || undefined,
          notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
          payment_methods: {
            installments: payload.maxInstallments || 12,
          },
          statement_descriptor: 'LOJA ONLINE',
        };

        // Add shipping as a separate item if present
        if (payload.shippingCost && payload.shippingCost > 0) {
          preferenceBody.shipments = {
            cost: toCurrencyNumber(payload.shippingCost),
            mode: 'not_specified',
          };
        }

        console.log('[MercadoPago] Creating checkout preference:', JSON.stringify({
          item_title: preferenceBody.items[0].title,
          item_price: preferenceBody.items[0].unit_price,
          quantity: preferenceBody.items[0].quantity,
          has_shipping: !!preferenceBody.shipments,
          payer_email: preferenceBody.payer.email,
        }));

        const mpPrefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mpAccessToken}`,
          },
          body: JSON.stringify(preferenceBody),
        });

        const mpPrefRaw = await mpPrefRes.text();
        let mpPrefData: any = {};
        if (mpPrefRaw) { try { mpPrefData = JSON.parse(mpPrefRaw); } catch { mpPrefData = { message: mpPrefRaw }; } }

        if (!mpPrefRes.ok) {
          const errMsg = mpPrefData?.message || `MercadoPago checkout error [${mpPrefRes.status}]`;
          throw new Error(errMsg);
        }

        const mpCheckoutUrl = mpPrefData.init_point || mpPrefData.sandbox_init_point;
        if (!mpCheckoutUrl) throw new Error('Mercado Pago não retornou URL de checkout');

        // Update order with MP preference ID
        if (payload.orderId && mpPrefData.id) {
          const sb = createClient(supabaseUrl, supabaseKey);
          await sb.from('orders').update({
            asaas_payment_id: mpPrefData.id,
            status: 'PENDING',
          }).eq('id', payload.orderId);
        }

        result = {
          id: mpPrefData.id,
          status: 'PENDING',
          checkoutUrl: mpCheckoutUrl,
        };
        break;
      }

      case 'create_pagbank_checkout': {
        // PagBank Checkout Redirect — creates a checkout URL and redirects the customer
        const pbGw = gateway as PagBankGateway;
        const pbBaseUrl = (pbGw as any).baseUrl;
        const pbTokenVal = (pbGw as any).token;
        const cpfVal = (payload.creditCardHolderInfo?.cpfCnpj || '').replace(/\D/g, '');
        const phoneDigitsVal = sanitizePhone(payload.creditCardHolderInfo?.phone);
        const supabaseUrlVal = Deno.env.get('SUPABASE_URL')!;

        const checkoutBody: any = {
          reference_id: payload.orderId || crypto.randomUUID(),
          customer: {
            name: payload.creditCardHolderInfo?.name || 'Cliente',
            email: payload.creditCardHolderInfo?.email || 'customer@email.com',
            tax_id: cpfVal,
            phones: phoneDigitsVal ? [{
              country: '55',
              area: phoneDigitsVal.slice(0, 2),
              number: phoneDigitsVal.slice(2),
              type: 'MOBILE',
            }] : [],
          },
          items: [{
            reference_id: payload.orderId || 'item',
            name: sanitizeDescription(payload.description),
            quantity: payload.quantity || 1,
            unit_amount: Math.round(toCurrencyNumber(payload.value / (payload.quantity || 1)) * 100),
          }],
          payment_methods: [{ type: 'CREDIT_CARD' }, { type: 'DEBIT_CARD' }, { type: 'PIX' }],
          payment_methods_configs: [{
            type: 'CREDIT_CARD',
            config_options: [{
              option: 'INSTALLMENTS_LIMIT',
              value: String(payload.maxInstallments || 12),
            }],
          }],
          soft_descriptor: sanitizeDescription(payload.softDescriptor || 'Loja').slice(0, 17),
          redirect_url: fallbackRedirectUrl,
          return_url: fallbackRedirectUrl,
          notification_urls: [`${supabaseUrlVal}/functions/v1/pagbank-webhook`],
          payment_notification_urls: [`${supabaseUrlVal}/functions/v1/pagbank-webhook`],
        };

        // Add shipping amount if present
        if (payload.shippingCost && payload.shippingCost > 0) {
          checkoutBody.shipping = {
            amount: Math.round(toCurrencyNumber(payload.shippingCost) * 100),
          };
        }

        console.log('[PagBank] Creating checkout redirect:', JSON.stringify({
          reference_id: checkoutBody.reference_id,
          item_amount: checkoutBody.items[0].unit_amount,
          quantity: checkoutBody.items[0].quantity,
          has_shipping: !!checkoutBody.shipping,
        }));

        const checkoutRes = await fetch(`${pbBaseUrl}/checkouts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pbTokenVal}`,
          },
          body: JSON.stringify(checkoutBody),
        });

        const checkoutRaw = await checkoutRes.text();
        let checkoutData: any = {};
        if (checkoutRaw) { try { checkoutData = JSON.parse(checkoutRaw); } catch { checkoutData = { message: checkoutRaw }; } }

        if (!checkoutRes.ok) {
          const errMsgs = Array.isArray(checkoutData?.error_messages)
            ? checkoutData.error_messages.map((e: any) => e?.description || e?.message).filter(Boolean).join(' | ')
            : '';
          throw new Error(errMsgs || checkoutData?.message || `PagBank checkout error [${checkoutRes.status}]`);
        }

        // Find the PAY link
        const payLink = checkoutData.links?.find((l: any) => l.rel === 'PAY');
        const checkoutUrl = payLink?.href || '';

        if (!checkoutUrl) throw new Error('PagBank não retornou URL de checkout');

        // Update order with PagBank checkout ID
        if (payload.orderId && checkoutData.id) {
          const sb = createClient(supabaseUrl, supabaseKey);
          await sb.from('orders').update({
            asaas_payment_id: checkoutData.id,
            status: 'PENDING',
          }).eq('id', payload.orderId);
        }

        result = {
          id: checkoutData.id,
          status: 'PENDING',
          checkoutUrl,
        };
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
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
