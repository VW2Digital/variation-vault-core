/**
 * Hook para integração com o SDK do Mercado Pago no checkout transparente.
 * Carrega o SDK JS e fornece a função de tokenização de cartão.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchSetting } from '@/lib/api';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

let sdkLoaded = false;
let sdkPromise: Promise<void> | null = null;

function loadMercadoPagoSdk(): Promise<void> {
  if (sdkLoaded) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => { sdkLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
    document.head.appendChild(script);
  });
  return sdkPromise;
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

export interface UseMercadoPagoReturn {
  isReady: boolean;
  publicKey: string;
  tokenizeCard: (data: MpCardData) => Promise<string>;
  activeGateway: string;
  gatewayEnvironment: string;
}

export function useMercadoPago(): UseMercadoPagoReturn {
  const [isReady, setIsReady] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [activeGateway, setActiveGateway] = useState('asaas');
  const [gatewayEnvironment, setGatewayEnvironment] = useState('sandbox');
  const [mpInstance, setMpInstance] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [gateway, mpEnv] = await Promise.all([
          fetchSetting('payment_gateway'),
          fetchSetting('mercadopago_environment'),
        ]);

        if (cancelled) return;
        setActiveGateway(gateway || 'asaas');
        setGatewayEnvironment(mpEnv || 'sandbox');

        if (gateway !== 'mercadopago') return;

        const currentEnv = mpEnv || 'sandbox';

        // Try env-specific public key first, fallback to generic
        let mpPubKey = await fetchSetting(`mercadopago_public_key_${currentEnv}`);
        if (!mpPubKey) {
          mpPubKey = await fetchSetting('mercadopago_public_key');
        }

        if (cancelled || !mpPubKey) return;

        setPublicKey(mpPubKey);
        await loadMercadoPagoSdk();

        if (cancelled) return;

        const mp = new window.MercadoPago(mpPubKey, { locale: 'pt-BR' });
        setMpInstance(mp);
        setIsReady(true);
      } catch (e) {
        console.error('Erro ao inicializar Mercado Pago:', e);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  const tokenizeCard = useCallback(async (data: MpCardData): Promise<string> => {
    if (!mpInstance) throw new Error('SDK do Mercado Pago não inicializado');

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

    return cardTokenResponse.id;
  }, [mpInstance]);

  return { isReady, publicKey, tokenizeCard, activeGateway };
}
