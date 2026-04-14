// Facebook Pixel event helpers
const fbq = (...args: unknown[]) => {
  try {
    if (typeof window !== 'undefined' && typeof (window as any).fbq === 'function') {
      (window as any).fbq(...args);
    }
  } catch { /* non-blocking */ }
};

export const fbViewContent = (item: { id: string; name: string; category?: string; price: number }) => {
  fbq('track', 'ViewContent', {
    content_ids: [item.id],
    content_name: item.name,
    content_category: item.category || '',
    content_type: 'product',
    value: item.price,
    currency: 'BRL',
  });
};

export const fbAddToCart = (item: { id: string; name: string; price: number; quantity: number }) => {
  fbq('track', 'AddToCart', {
    content_ids: [item.id],
    content_name: item.name,
    content_type: 'product',
    value: item.price * item.quantity,
    currency: 'BRL',
  });
};

export const fbInitiateCheckout = (value: number, items: { id: string; name: string; price: number; quantity: number }[]) => {
  fbq('track', 'InitiateCheckout', {
    content_ids: items.map(i => i.id),
    contents: items.map(i => ({ id: i.id, quantity: i.quantity })),
    num_items: items.reduce((sum, i) => sum + i.quantity, 0),
    value,
    currency: 'BRL',
  });
};

export const fbPurchase = (value: number, items: { id: string; name: string; price: number; quantity: number }[]) => {
  fbq('track', 'Purchase', {
    content_ids: items.map(i => i.id),
    contents: items.map(i => ({ id: i.id, quantity: i.quantity })),
    content_type: 'product',
    num_items: items.reduce((sum, i) => sum + i.quantity, 0),
    value,
    currency: 'BRL',
  });
};

export const fbAddPaymentInfo = () => {
  fbq('track', 'AddPaymentInfo');
};
