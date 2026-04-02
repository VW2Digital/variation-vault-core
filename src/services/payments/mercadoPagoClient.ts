import { supabase } from '@/integrations/supabase/client';

export type CheckoutGateway = 'asaas' | 'mercadopago';
export type CheckoutMethod = 'credit_card' | 'pix';

export interface MpPaymentRequest {
  gateway: CheckoutGateway;
  method: CheckoutMethod;
  orderId: string;
  amount: number;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  card?: {
    token: string;
    issuerId?: string;
    paymentMethodId: string;
    installments: number;
  };
}

export interface MpPaymentResponse {
  paymentId: string;
  status: string;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
}

/**
 * Creates a payment via the payment-checkout edge function.
 * Works with both Asaas and Mercado Pago gateways.
 */
export async function createMercadoPagoPayment(
  request: MpPaymentRequest
): Promise<MpPaymentResponse> {
  const { data, error } = await supabase.functions.invoke('payment-checkout', {
    body: {
      action: request.method === 'pix' ? 'create_pix_payment' : 'create_card_payment',
      ...request,
    },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  return data;
}

/**
 * Gets the status of a payment from the active gateway.
 */
export async function getPaymentStatus(paymentId: string): Promise<{ id: string; status: string }> {
  const { data, error } = await supabase.functions.invoke('payment-checkout', {
    body: { action: 'get_status', paymentId },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  return data;
}
