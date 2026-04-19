/**
 * Hook para integração com SDKs de pagamento no checkout transparente.
 * Suporta Mercado Pago, PagBank e Pagar.me.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchSetting } from '@/lib/api';

declare global {
  interface Window {
    MercadoPago: any;
    PagSeguro: any;
  }
}

// ── Mercado Pago SDK ──
let mpSdkLoaded = false;
let mpSdkPromise: Promise<void> | null = null;

function loadMercadoPagoSdk(): Promise<void> {
  if (mpSdkLoaded) return Promise.resolve();
  if (mpSdkPromise) return mpSdkPromise;

  mpSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => { mpSdkLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
    document.head.appendChild(script);
  });
  return mpSdkPromise;
}

// ── PagBank SDK ──
let pbSdkLoaded = false;
let pbSdkPromise: Promise<void> | null = null;

function loadPagBankSdk(): Promise<void> {
  if (pbSdkLoaded && window.PagSeguro) return Promise.resolve();
  if (pbSdkPromise) return pbSdkPromise;

  pbSdkPromise = new Promise((resolve, reject) => {
    if (window.PagSeguro) {
      pbSdkLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js';
    script.onload = () => {
      let attempts = 0;
      const check = () => {
        if (window.PagSeguro) {
          pbSdkLoaded = true;
          resolve();
        } else if (attempts < 50) {
          attempts++;
          setTimeout(check, 100);
        } else {
          reject(new Error('SDK do PagBank carregado mas PagSeguro não disponível no window'));
        }
      };
      check();
    };
    script.onerror = () => {
      pbSdkPromise = null;
      reject(new Error('Falha ao carregar SDK do PagBank'));
    };
    document.head.appendChild(script);
  });
  return pbSdkPromise;
}

export interface MpCardData {
  cardNumber: string;
  cardholderName: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
  identificationType: string;
  identificationNumber: string;
}

export interface MpTokenizeResult {
  token: string;
  paymentMethodId: string;
  issuerId: string;
}

export interface PbEncryptResult {
  encrypted: string;
}

export interface PgmeCardData {
  number: string;
  holderName: string;
  expMonth: string;
  expYear: string;
  cvv: string;
}

export interface PgmeTokenizeResult {
  token: string;
}

export interface UseMercadoPagoReturn {
  isReady: boolean;
  publicKey: string;
  tokenizeCard: (data: MpCardData) => Promise<MpTokenizeResult>;
  encryptPagBankCard: (data: { holder: string; number: string; expMonth: string; expYear: string; securityCode: string }) => Promise<PbEncryptResult>;
  tokenizePagarMeCard: (data: PgmeCardData) => Promise<PgmeTokenizeResult>;
  activeGateway: string;
  gatewayEnvironment: string;
  deviceSessionId: string;
  checkoutMode: 'transparent' | 'redirect';
}

export function useMercadoPago(): UseMercadoPagoReturn {
  const [isReady, setIsReady] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [activeGateway, setActiveGateway] = useState('asaas');
  const [gatewayEnvironment, setGatewayEnvironment] = useState('sandbox');
  const [mpInstance, setMpInstance] = useState<any>(null);
  const [deviceSessionId, setDeviceSessionId] = useState('');
  const [pbPublicKey, setPbPublicKey] = useState('');
  const [pgmePublicKey, setPgmePublicKey] = useState('');
  const [checkoutMode, setCheckoutMode] = useState<'transparent' | 'redirect'>('transparent');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [gateway, mpEnv, asaasEnv, pbEnv, pgmeEnv, mpCheckoutMode] = await Promise.all([
          fetchSetting('payment_gateway'),
          fetchSetting('mercadopago_environment'),
          fetchSetting('asaas_environment'),
          fetchSetting('pagbank_environment'),
          fetchSetting('pagarme_environment'),
          fetchSetting('mercadopago_checkout_mode'),
        ]);

        if (cancelled) return;
        const gw = gateway || 'asaas';
        setActiveGateway(gw);
        const mode = (mpCheckoutMode === 'redirect') ? 'redirect' : 'transparent';
        setCheckoutMode(mode);
        setGatewayEnvironment(
          gw === 'mercadopago' ? (mpEnv || 'sandbox')
            : gw === 'pagbank' ? (pbEnv || 'sandbox')
            : gw === 'pagarme' ? (pgmeEnv || 'sandbox')
            : (asaasEnv || 'sandbox')
        );

        // ── Mercado Pago init ──
        if (gw === 'mercadopago' && mode === 'transparent') {
          const currentEnv = mpEnv || 'sandbox';
          let mpPubKey = await fetchSetting(`mercadopago_public_key_${currentEnv}`);
          if (!mpPubKey) mpPubKey = await fetchSetting('mercadopago_public_key');

          if (cancelled || !mpPubKey) return;
          setPublicKey(mpPubKey);
          await loadMercadoPagoSdk();
          if (cancelled) return;

          const mp = new window.MercadoPago(mpPubKey, { locale: 'pt-BR' });
          setMpInstance(mp);
          setIsReady(true);

          const checkDeviceId = () => {
            const did = (window as any).MP_DEVICE_SESSION_ID;
            if (did) {
              setDeviceSessionId(did);
              console.log('[MP] Device Session ID captured:', did.substring(0, 12) + '...');
            }
          };
          checkDeviceId();
          if (!(window as any).MP_DEVICE_SESSION_ID) {
            const interval = setInterval(() => {
              checkDeviceId();
              if ((window as any).MP_DEVICE_SESSION_ID) clearInterval(interval);
            }, 500);
            setTimeout(() => clearInterval(interval), 10000);
          }
          return;
        }

        if (gw === 'mercadopago' && mode === 'redirect') {
          setIsReady(true);
          console.log('[MercadoPago] Redirect mode — no SDK needed');
          return;
        }

        // ── PagBank: redirect, no SDK ──
        if (gw === 'pagbank') {
          setIsReady(true);
          console.log('[PagBank] Redirect mode — no SDK needed');
          return;
        }

        // ── Pagar.me init ──
        if (gw === 'pagarme') {
          const currentEnv = pgmeEnv || 'sandbox';
          let pubKey = await fetchSetting(`pagarme_public_key_${currentEnv}`);
          if (!pubKey) pubKey = await fetchSetting('pagarme_public_key');
          if (cancelled) return;
          if (pubKey) {
            setPgmePublicKey(pubKey);
            setPublicKey(pubKey);
          } else {
            console.warn('[Pagar.me] Public Key não configurada — tokenização indisponível');
          }
          // Pagar.me tokenization is done via direct API call (no SDK script)
          setIsReady(true);
          return;
        }

        // Asaas: no SDK needed
        setIsReady(true);
      } catch (e) {
        console.error('Erro ao inicializar gateway de pagamento:', e);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Mercado Pago tokenization ──
  const tokenizeCard = useCallback(async (data: MpCardData): Promise<MpTokenizeResult> => {
    if (!mpInstance) throw new Error('SDK do Mercado Pago não inicializado');

    const bin = data.cardNumber.replace(/\s/g, '').substring(0, 6);

    let paymentMethodId = '';
    let issuerId = '';
    try {
      const pmResponse = await mpInstance.getPaymentMethods({ bin });
      if (pmResponse?.results?.length > 0) {
        paymentMethodId = pmResponse.results[0].id || '';
        issuerId = pmResponse.results[0].issuer?.id ? String(pmResponse.results[0].issuer.id) : '';
      }
    } catch (e) {
      console.warn('[MP] Could not detect payment method from BIN:', e);
    }

    if (paymentMethodId && !issuerId) {
      try {
        const issuers = await mpInstance.getIssuers({ paymentMethodId, bin });
        if (issuers?.length > 0) issuerId = String(issuers[0].id);
      } catch (e) {
        console.warn('[MP] Could not get issuers:', e);
      }
    }

    const cardTokenResponse = await mpInstance.createCardToken({
      cardNumber: data.cardNumber.replace(/\s/g, ''),
      cardholderName: data.cardholderName,
      cardExpirationMonth: data.expirationMonth,
      cardExpirationYear: data.expirationYear,
      securityCode: data.securityCode,
      identificationType: data.identificationType || 'CPF',
      identificationNumber: data.identificationNumber.replace(/\D/g, ''),
    });

    if (!cardTokenResponse?.id) {
      throw new Error('Falha na tokenização do cartão. Verifique os dados.');
    }

    return { token: cardTokenResponse.id, paymentMethodId, issuerId };
  }, [mpInstance]);

  // ── PagBank card encryption ──
  const encryptPagBankCard = useCallback(async (data: { holder: string; number: string; expMonth: string; expYear: string; securityCode: string }): Promise<PbEncryptResult> => {
    if (!window.PagSeguro) throw new Error('SDK do PagBank não carregado');
    if (!pbPublicKey) throw new Error('Public Key do PagBank não configurada');

    const card = window.PagSeguro.encryptCard({
      publicKey: pbPublicKey,
      holder: data.holder,
      number: data.number.replace(/\s/g, ''),
      expMonth: data.expMonth.padStart(2, '0'),
      expYear: data.expYear.length === 2 ? `20${data.expYear}` : data.expYear,
      securityCode: data.securityCode,
    });

    if (card.hasErrors) {
      const errors = card.errors?.map((e: any) => e.message || e.code).join(', ') || 'Dados do cartão inválidos';
      throw new Error(`Erro na criptografia do cartão: ${errors}`);
    }

    return { encrypted: card.encryptedCard };
  }, [pbPublicKey]);

  // ── Pagar.me card tokenization (direct API call with public key) ──
  // Reference: https://docs.pagar.me/reference/criar-token-de-cart%C3%A3o-1
  const tokenizePagarMeCard = useCallback(async (data: PgmeCardData): Promise<PgmeTokenizeResult> => {
    if (!pgmePublicKey) throw new Error('Public Key do Pagar.me não configurada');

    const expMonth = parseInt(data.expMonth, 10);
    const expYear = data.expYear.length === 2 ? parseInt(`20${data.expYear}`, 10) : parseInt(data.expYear, 10);

    const body = {
      type: 'card',
      card: {
        number: data.number.replace(/\s/g, ''),
        holder_name: data.holderName.trim(),
        exp_month: expMonth,
        exp_year: expYear,
        cvv: data.cvv,
      },
    };

    const url = `https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(pgmePublicKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let json: any = {};
    if (raw) { try { json = JSON.parse(raw); } catch { json = { message: raw }; } }

    if (!res.ok || !json.id) {
      const errs = json?.errors;
      let msg = json?.message || `Falha na tokenização [${res.status}]`;
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

    console.log('[Pagar.me] Card tokenized:', json.id.substring(0, 8) + '...');
    return { token: json.id };
  }, [pgmePublicKey]);

  return {
    isReady, publicKey, tokenizeCard, encryptPagBankCard, tokenizePagarMeCard,
    activeGateway, gatewayEnvironment, deviceSessionId, checkoutMode,
  };
}
