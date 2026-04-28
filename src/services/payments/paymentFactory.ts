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

/** Default-true setting reader: missing or empty string ⇒ true (backward compatible). */
async function fetchBoolSetting(key: string): Promise<boolean> {
  const v = await fetchSetting(key);
  if (v === null || v === undefined || v === '') return true;
  return v !== 'false';
}

/**
 * Whether a gateway is operational (admin can switch it off entirely).
 */
export async function isGatewayEnabled(gateway: CheckoutGateway): Promise<boolean> {
  return fetchBoolSetting(`${gateway}_enabled`);
}

/**
 * Whether a gateway is allowed to be offered as a fallback option after
 * a card rejection. Requires both `<gw>_enabled` and `<gw>_fallback_enabled`.
 */
export async function isGatewayFallbackEligible(gateway: CheckoutGateway): Promise<boolean> {
  const [enabled, fallback] = await Promise.all([
    fetchBoolSetting(`${gateway}_enabled`),
    fetchBoolSetting(`${gateway}_fallback_enabled`),
  ]);
  return enabled && fallback;
}

/**
 * Card gateway fallback chain. Order: Mercado Pago → Pagar.me → Asaas.
 * PagBank is excluded because it uses a redirect flow (not transparent),
 * so it cannot be used as an in-form retry option.
 */
export const CARD_FALLBACK_ORDER: CheckoutGateway[] = ['mercadopago', 'pagarme', 'asaas'];

export interface AvailableCardGateway {
  gateway: CheckoutGateway;
  label: string;
  publicKey?: string; // for SDKs that need it on the frontend
  environment: 'sandbox' | 'production';
}

const GATEWAY_LABELS: Record<CheckoutGateway, string> = {
  mercadopago: 'Mercado Pago',
  pagarme: 'Pagar.me',
  asaas: 'Asaas',
  pagbank: 'PagBank',
};

/**
 * Returns the list of card gateways that are configured (have valid keys)
 * EXCLUDING the one currently being used. Used to populate the
 * "Try with another processor" fallback buttons after a card rejection.
 */
export async function getAvailableCardFallbacks(currentGateway: CheckoutGateway): Promise<AvailableCardGateway[]> {
  const candidates = CARD_FALLBACK_ORDER.filter((g) => g !== currentGateway);
  const results: AvailableCardGateway[] = [];

  for (const gw of candidates) {
    try {
      // Respect admin toggles: gateway must be enabled AND marked fallback-eligible
      if (!(await isGatewayFallbackEligible(gw))) continue;

      if (gw === 'mercadopago') {
        const env = (await fetchSetting('mercadopago_environment')) === 'production' ? 'production' : 'sandbox';
        const pk = (await fetchSetting(`mercadopago_public_key_${env}`)) || (await fetchSetting('mercadopago_public_key'));
        if (pk) results.push({ gateway: gw, label: GATEWAY_LABELS[gw], publicKey: pk, environment: env });
      } else if (gw === 'pagarme') {
        const env = (await fetchSetting('pagarme_environment')) === 'production' ? 'production' : 'sandbox';
        const pk = (await fetchSetting(`pagarme_public_key_${env}`)) || (await fetchSetting('pagarme_public_key'));
        if (pk) results.push({ gateway: gw, label: GATEWAY_LABELS[gw], publicKey: pk, environment: env });
      } else if (gw === 'asaas') {
        // Asaas tokenization is server-side, so we just need to know the gateway is configured.
        // We can't read the secret API key from the client; assume admin has set it if user enabled fallback.
        // We mark Asaas as available always as a last-resort fallback (server will reject if not configured).
        const env = (await fetchSetting('asaas_environment')) === 'production' ? 'production' : 'sandbox';
        results.push({ gateway: gw, label: GATEWAY_LABELS[gw], environment: env });
      }
    } catch {
      // Ignore — gateway not configured
    }
  }

  return results;
}
