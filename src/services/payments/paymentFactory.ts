import { fetchSetting } from '@/lib/api';

export type CheckoutGateway = 'asaas' | 'mercadopago' | 'pagbank' | 'pagarme';

/**
 * Returns the active payment gateway from site_settings.
 */
export async function getActiveGateway(): Promise<CheckoutGateway> {
  const gateway = await fetchSetting('payment_gateway');
  if (gateway === 'mercadopago') return 'mercadopago';
  if (gateway === 'pagbank') return 'pagbank';
  if (gateway === 'pagarme') return 'pagarme';
  return 'asaas';
}

/**
 * Returns the active gateway environment (sandbox or production).
 */
export async function getGatewayEnvironment(gateway: CheckoutGateway): Promise<'sandbox' | 'production'> {
  if (gateway === 'mercadopago') {
    const env = await fetchSetting('mercadopago_environment');
    return env === 'production' ? 'production' : 'sandbox';
  }
  if (gateway === 'pagbank') {
    const env = await fetchSetting('pagbank_environment');
    return env === 'production' ? 'production' : 'sandbox';
  }
  if (gateway === 'pagarme') {
    const env = await fetchSetting('pagarme_environment');
    return env === 'production' ? 'production' : 'sandbox';
  }
  const env = await fetchSetting('asaas_environment');
  return env === 'production' ? 'production' : 'sandbox';
}

/**
 * Returns the Pagar.me public key for frontend SDK card tokenization.
 */
export async function getPagarMePublicKey(): Promise<string> {
  const env = await fetchSetting('pagarme_environment') || 'sandbox';
  const key = await fetchSetting(`pagarme_public_key_${env}`);
  if (key) return key;
  return await fetchSetting('pagarme_public_key');
}

/**
 * Returns the Mercado Pago public key for frontend SDK initialization.
 */
export async function getMercadoPagoPublicKey(): Promise<string> {
  return await fetchSetting('mercadopago_public_key');
}

/**
 * Returns the PagBank public key for frontend card encryption.
 */
export async function getPagBankPublicKey(): Promise<string> {
  return await fetchSetting('pagbank_public_key');
}
