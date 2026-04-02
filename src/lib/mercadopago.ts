declare global {
  interface Window {
    MercadoPago: any;
  }
}

let sdkPromise: Promise<any> | null = null;

export function loadMercadoPago(publicKey: string) {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    if (window.MercadoPago) {
      resolve(new window.MercadoPago(publicKey, { locale: 'pt-BR' }));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => resolve(new window.MercadoPago(publicKey, { locale: 'pt-BR' }));
    script.onerror = () => reject(new Error('Falha ao carregar SDK do Mercado Pago'));
    document.body.appendChild(script);
  });

  return sdkPromise;
}

export function resetSdkPromise() {
  sdkPromise = null;
}
