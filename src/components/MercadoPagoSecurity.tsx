import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SCRIPT_SRC = 'https://www.mercadopago.com/v2/security.js';

function getView(pathname: string): string {
  // checkout pages
  if (
    pathname.startsWith('/checkout/') ||
    pathname === '/checkout-carrinho' ||
    pathname.startsWith('/pagar/')
  ) {
    return 'checkout';
  }
  // cart page
  if (pathname === '/carrinho') {
    return 'search_results';
  }
  // product page
  if (pathname.startsWith('/produto/')) {
    return 'item';
  }
  // home / catalog
  if (pathname === '/' || pathname === '/catalogo') {
    return 'home';
  }
  // all other pages
  return 'home';
}

const MercadoPagoSecurity = () => {
  const { pathname } = useLocation();
  const view = getView(pathname);

  useEffect(() => {
    // Remove existing security script if view changed
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.remove();
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.setAttribute('view', view);
    script.async = true;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [view]);

  return null;
};

export default MercadoPagoSecurity;
