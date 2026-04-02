import { fetchSetting } from '@/lib/api';

export type CheckoutGateway = 'asaas' | 'mercadopago';

/**
 * Returns the active payment gateway from site_settings.
 */
export async function getActiveGateway(): Promise<CheckoutGateway> {
  const gateway = await fetchSetting('payment_gateway');
  return (gateway === 'mercadopago' ? 'mercadopago' : 'asaas') as CheckoutGateway;
}

/**
 * Returns the active gateway environment (sandbox or production).
 */
export async function getGatewayEnvironment(gateway: CheckoutGateway): Promise<'sandbox' | 'production'> {
  if (gateway === 'mercadopago') {
    const env = await fetchSetting('mercadopago_environment');
    return env === 'production' ? 'production' : 'sandbox';
  }
  const env = await fetchSetting('asaas_environment');
  return env === 'production' ? 'production' : 'sandbox';
}

/**
 * Returns the Mercado Pago public key for frontend SDK initialization.
 */
export async function getMercadoPagoPublicKey(): Promise<string> {
  return await fetchSetting('mercadopago_public_key');
}
