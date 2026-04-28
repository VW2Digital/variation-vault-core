/**
 * Ad-hoc card tokenizers for fallback flow.
 *
 * The main `useMercadoPago` hook initializes ONE gateway SDK at mount time,
 * but the multi-gateway fallback needs to tokenize a card with a DIFFERENT
 * gateway after a rejection. These functions load the right SDK on demand
 * and tokenize without touching the hook's internal state.
 */
import type { CheckoutGateway } from './paymentFactory';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export interface CardInput {
  number: string;
  holderName: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  cpf: string; // digits only
}

export interface TokenizedCard {
  /** Payload to send as `creditCard` in `payment-checkout` */
  creditCard: any;
  /** MP-specific extras */
  paymentMethodId?: string;
  issuerId?: string;
}

// ── Mercado Pago ────────────────────────────────────────────────
let mpSdkLoaded = false;
let mpSdkPromise: Promise<void> | null = null;

function loadMpSdk(): Promise<void> {
  if (mpSdkLoaded && window.MercadoPago) return Promise.resolve();
  if (mpSdkPromise) return mpSdkPromise;
  mpSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://sdk.mercadopago.com/js/v2"]');
    if (existing) {
      const check = () => {
        if (window.MercadoPago) { mpSdkLoaded = true; resolve(); }
        else setTimeout(check, 100);
      };
      check();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => { mpSdkLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
    document.head.appendChild(script);
  });
  return mpSdkPromise;
}

async function tokenizeMercadoPago(card: CardInput, publicKey: string): Promise<TokenizedCard> {
  await loadMpSdk();
  const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });

  const bin = card.number.replace(/\s/g, '').substring(0, 6);
  let paymentMethodId = '';
  let issuerId = '';
  try {
    const pm = await mp.getPaymentMethods({ bin });
    if (pm?.results?.length > 0) {
      paymentMethodId = pm.results[0].id || '';
      issuerId = pm.results[0].issuer?.id ? String(pm.results[0].issuer.id) : '';
    }
  } catch { /* ignore */ }
  if (paymentMethodId && !issuerId) {
    try {
      const issuers = await mp.getIssuers({ paymentMethodId, bin });
      if (issuers?.length > 0) issuerId = String(issuers[0].id);
    } catch { /* ignore */ }
  }

  const tokenRes = await mp.createCardToken({
    cardNumber: card.number.replace(/\s/g, ''),
    cardholderName: card.holderName,
    cardExpirationMonth: card.expMonth,
    cardExpirationYear: card.expYear,
    securityCode: card.cvv,
    identificationType: 'CPF',
    identificationNumber: card.cpf,
  });
  if (!tokenRes?.id) throw new Error('Falha na tokenização do cartão (Mercado Pago).');

  return { creditCard: { token: tokenRes.id }, paymentMethodId, issuerId };
}

// ── Pagar.me ────────────────────────────────────────────────────
async function tokenizePagarMe(card: CardInput, publicKey: string): Promise<TokenizedCard> {
  const expMonth = parseInt(card.expMonth, 10);
  const expYear = card.expYear.length === 2 ? parseInt(`20${card.expYear}`, 10) : parseInt(card.expYear, 10);

  const url = `https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'card',
      card: {
        number: card.number.replace(/\s/g, ''),
        holder_name: card.holderName.trim(),
        exp_month: expMonth,
        exp_year: expYear,
        cvv: card.cvv,
      },
    }),
  });
  const raw = await res.text();
  let json: any = {};
  if (raw) { try { json = JSON.parse(raw); } catch { json = { message: raw }; } }

  if (!res.ok || !json.id) {
    let msg = json?.message || `Falha na tokenização Pagar.me [${res.status}]`;
    const errs = json?.errors;
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
  return { creditCard: { token: json.id } };
}

// ── Asaas (server-side tokenization) ────────────────────────────
function tokenizeAsaas(card: CardInput): TokenizedCard {
  return {
    creditCard: {
      holderName: card.holderName.trim(),
      number: card.number.replace(/\s/g, ''),
      expiryMonth: card.expMonth,
      expiryYear: card.expYear,
      ccv: card.cvv,
    },
  };
}

/**
 * Tokenize a card for any supported gateway. Loads SDKs on demand.
 * `publicKey` is required for mercadopago and pagarme.
 */
export async function tokenizeCardForGateway(
  gateway: CheckoutGateway,
  card: CardInput,
  publicKey?: string,
): Promise<TokenizedCard> {
  if (gateway === 'mercadopago') {
    if (!publicKey) throw new Error('Public key do Mercado Pago não disponível');
    return tokenizeMercadoPago(card, publicKey);
  }
  if (gateway === 'pagarme') {
    if (!publicKey) throw new Error('Public key do Pagar.me não disponível');
    return tokenizePagarMe(card, publicKey);
  }
  if (gateway === 'asaas') return tokenizeAsaas(card);
  throw new Error(`Gateway "${gateway}" não suportado para fallback de cartão`);
}