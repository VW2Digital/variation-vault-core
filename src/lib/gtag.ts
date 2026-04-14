// Google Ads / GA4 event helper
export const gtagEvent = (eventName: string, params?: Record<string, unknown>) => {
  try {
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', eventName, params);
    }
  } catch { /* non-blocking */ }
};

export const gtagViewItemList = (items: { id: string; name: string; category?: string; price?: number }[]) => {
  gtagEvent('view_item_list', {
    item_list_name: 'Catálogo',
    items: items.map((item, index) => ({
      item_id: item.id,
      item_name: item.name,
      item_category: item.category || '',
      price: item.price || 0,
      index,
    })),
  });
};

export const gtagViewItem = (item: { id: string; name: string; category?: string; price: number; variant?: string }) => {
  gtagEvent('view_item', {
    currency: 'BRL',
    value: item.price,
    items: [{
      item_id: item.id,
      item_name: item.name,
      item_category: item.category || '',
      item_variant: item.variant || '',
      price: item.price,
    }],
  });
};

export const gtagAddToCart = (item: { id: string; name: string; price: number; quantity: number; variant?: string }) => {
  gtagEvent('add_to_cart', {
    currency: 'BRL',
    value: item.price * item.quantity,
    items: [{
      item_id: item.id,
      item_name: item.name,
      item_variant: item.variant || '',
      price: item.price,
      quantity: item.quantity,
    }],
  });
};

export const gtagBeginCheckout = (value: number, items: { id: string; name: string; price: number; quantity: number }[]) => {
  gtagEvent('begin_checkout', {
    currency: 'BRL',
    value,
    items: items.map(i => ({
      item_id: i.id,
      item_name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
  });
};
