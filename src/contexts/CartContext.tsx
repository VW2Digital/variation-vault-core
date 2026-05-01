import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { gtagAddToCart } from '@/lib/gtag';
import { fbAddToCart } from '@/lib/fbPixel';

export interface WholesaleTier {
  min_quantity: number;
  price: number;
}

export interface CartItem {
  id: string;
  product_id: string;
  variation_id: string;
  quantity: number;
  product_name: string;
  dosage: string;
  price: number;
  original_price: number;
  is_offer: boolean;
  image_url: string;
  in_stock: boolean;
  wholesale_prices: WholesaleTier[];
}

export const getEffectivePrice = (basePrice: number, quantity: number, wholesalePrices: WholesaleTier[]): number => {
  if (!wholesalePrices || wholesalePrices.length === 0) return basePrice;
  // Sort descending by min_quantity to find the best matching tier
  const sorted = [...wholesalePrices].sort((a, b) => b.min_quantity - a.min_quantity);
  const tier = sorted.find(t => quantity >= t.min_quantity);
  return tier ? tier.price : basePrice;
};

interface CartContextType {
  items: CartItem[];
  loading: boolean;
  addToCart: (productId: string, variationId: string, quantity?: number) => Promise<void>;
  removeFromCart: (variationId: string) => Promise<void>;
  updateQuantity: (variationId: string, quantity: number) => Promise<void>;
  updateQuantitiesBulk: (updates: Array<{ variationId: string; quantity: number }>) => Promise<{ adjusted: Array<{ name: string; minQty: number }> }>;
  clearCart: () => Promise<void>;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};

const ANON_CART_KEY = 'anon_cart_v1';

interface AnonCartEntry {
  product_id: string;
  variation_id: string;
  quantity: number;
}

const readAnonCart = (): AnonCartEntry[] => {
  try {
    const raw = localStorage.getItem(ANON_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeAnonCart = (entries: AnonCartEntry[]) => {
  try {
    localStorage.setItem(ANON_CART_KEY, JSON.stringify(entries));
  } catch {
    /* noop */
  }
};

const clearAnonCart = () => {
  try {
    localStorage.removeItem(ANON_CART_KEY);
  } catch {
    /* noop */
  }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const newUserId = session?.user?.id || null;
      // On sign-in/sign-up, merge anonymous cart into user's cart
      if (newUserId && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        const anon = readAnonCart();
        if (anon.length > 0) {
          try {
            const { data: existing } = await supabase
              .from('cart_items')
              .select('variation_id, quantity')
              .eq('user_id', newUserId);
            const existingMap = new Map((existing || []).map((e: any) => [e.variation_id, e.quantity]));
            for (const entry of anon) {
              const current = existingMap.get(entry.variation_id);
              if (current !== undefined) {
                await supabase
                  .from('cart_items')
                  .update({ quantity: current + entry.quantity })
                  .eq('user_id', newUserId)
                  .eq('variation_id', entry.variation_id);
              } else {
                await supabase
                  .from('cart_items')
                  .insert({ user_id: newUserId, product_id: entry.product_id, variation_id: entry.variation_id, quantity: entry.quantity });
              }
            }
            clearAnonCart();
          } catch (err) {
            console.error('Cart merge error:', err);
          }
        }
      }
      setUserId(newUserId);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      // Source rows: from DB if logged in, otherwise from localStorage
      let rows: { id: string; product_id: string; variation_id: string; quantity: number }[] = [];
      if (userId) {
        const { data, error } = await supabase
          .from('cart_items')
          .select('id, product_id, variation_id, quantity')
          .eq('user_id', userId);
        if (error) throw error;
        rows = data || [];
      } else {
        rows = readAnonCart().map((e) => ({
          id: `anon-${e.variation_id}`,
          product_id: e.product_id,
          variation_id: e.variation_id,
          quantity: e.quantity,
        }));
      }

      if (rows.length === 0) { setItems([]); return; }

      // Fetch product + variation details
      const varIds = rows.map(i => i.variation_id);
      const prodIds = [...new Set(rows.map(i => i.product_id))];

      const [{ data: variations }, { data: products }] = await Promise.all([
        supabase.from('product_variations').select('id, dosage, price, offer_price, is_offer, image_url, images, in_stock').in('id', varIds),
        supabase.from('products').select('id, name, images').in('id', prodIds),
      ]);

      // Fetch wholesale prices
      const { data: wholesaleData } = await supabase
        .from('wholesale_prices')
        .select('*')
        .in('variation_id', varIds)
        .order('min_quantity', { ascending: true });
      
      const wpMap: Record<string, WholesaleTier[]> = {};
      (wholesaleData || []).forEach((w: any) => {
        if (!wpMap[w.variation_id]) wpMap[w.variation_id] = [];
        wpMap[w.variation_id].push({ min_quantity: w.min_quantity, price: Number(w.price) });
      });

      const varMap = new Map((variations || []).map(v => [v.id, v]));
      const prodMap = new Map((products || []).map(p => [p.id, p]));

      const enriched: CartItem[] = rows.map(ci => {
        const v = varMap.get(ci.variation_id);
        const p = prodMap.get(ci.product_id);
        const isOffer = v?.is_offer && v?.offer_price;
        const basePrice = isOffer ? Number(v.offer_price) : Number(v?.price || 0);
        const wp = wpMap[ci.variation_id] || [];
        return {
          id: ci.id,
          product_id: ci.product_id,
          variation_id: ci.variation_id,
          quantity: ci.quantity,
          product_name: p?.name || '',
          dosage: v?.dosage || '',
          price: getEffectivePrice(basePrice, ci.quantity, wp),
          original_price: Number(v?.price || 0),
          is_offer: !!isOffer,
          image_url: v?.images?.[0] || v?.image_url || p?.images?.[0] || '',
          in_stock: v?.in_stock ?? false,
          wholesale_prices: wp,
        };
      });
      setItems(enriched);
    } catch (err: any) {
      console.error('Cart fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const addToCart = async (productId: string, variationId: string, quantity = 1) => {
    try {
      // Garantir quantidade mínima de atacado: se a variação tiver tier configurado,
      // não permitimos adicionar abaixo do mínimo.
      const { data: wpRows } = await supabase
        .from('wholesale_prices')
        .select('min_quantity')
        .eq('variation_id', variationId)
        .order('min_quantity', { ascending: true })
        .limit(1);
      const minWholesale = wpRows && wpRows.length > 0 ? wpRows[0].min_quantity : 0;
      if (minWholesale > 0 && quantity < minWholesale) {
        quantity = minWholesale;
      }
      if (!userId) {
        // Anonymous cart: persist to localStorage
        const anon = readAnonCart();
        const idx = anon.findIndex(e => e.variation_id === variationId);
        if (idx >= 0) {
          anon[idx].quantity += quantity;
        } else {
          anon.push({ product_id: productId, variation_id: variationId, quantity });
        }
        writeAnonCart(anon);
        await fetchCart();
        toast({ title: 'Adicionado ao carrinho!' });
        return;
      }
      // Upsert: if already exists, increment quantity
      const existing = items.find(i => i.variation_id === variationId);
      if (existing) {
        const newQty = existing.quantity + quantity;
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: newQty })
          .eq('user_id', userId)
          .eq('variation_id', variationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cart_items')
          .insert({ user_id: userId, product_id: productId, variation_id: variationId, quantity });
        if (error) throw error;
      }
      await fetchCart();
      // Google Ads: add_to_cart - fire after fetchCart so we have enriched item data
      const added = items.find(i => i.variation_id === variationId);
      gtagAddToCart({
        id: productId,
        name: added?.product_name || '',
        price: added?.price || 0,
        quantity,
        variant: added?.dosage || '',
      });
      fbAddToCart({
        id: productId,
        name: added?.product_name || '',
        price: added?.price || 0,
        quantity,
      });
      toast({ title: 'Adicionado ao carrinho!' });
    } catch (err: any) {
      toast({ title: 'Erro ao adicionar', description: err.message, variant: 'destructive' });
    }
  };

  const removeFromCart = async (variationId: string) => {
    try {
      if (!userId) {
        const anon = readAnonCart().filter(e => e.variation_id !== variationId);
        writeAnonCart(anon);
        await fetchCart();
        return;
      }
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', userId)
        .eq('variation_id', variationId);
      if (error) throw error;
      await fetchCart();
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    }
  };

  const updateQuantity = async (variationId: string, quantity: number) => {
    if (quantity < 1) return;
    // Enforce wholesale minimum: clamp up to the lowest tier and warn the user
    const item = items.find(i => i.variation_id === variationId);
    let finalQuantity = quantity;
    if (item && item.wholesale_prices.length > 0) {
      const minQty = Math.min(...item.wholesale_prices.map(t => t.min_quantity));
      if (quantity < minQty) {
        finalQuantity = minQty;
        toast({
          title: 'Quantidade ajustada para o atacado',
          description: `${item.product_name}${item.dosage ? ` (${item.dosage})` : ''} exige no mínimo ${minQty} unidades. Quantidade atualizada para ${minQty}.`,
        });
      }
    }
    try {
      if (!userId) {
        const anon = readAnonCart();
        const idx = anon.findIndex(e => e.variation_id === variationId);
        if (idx >= 0) {
          anon[idx].quantity = finalQuantity;
          writeAnonCart(anon);
          await fetchCart();
        }
        return;
      }
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: finalQuantity })
        .eq('user_id', userId)
        .eq('variation_id', variationId);
      if (error) throw error;
      await fetchCart();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    }
  };

  const clearCart = async () => {
    try {
      if (!userId) {
        clearAnonCart();
        setItems([]);
        return;
      }
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
      setItems([]);
    } catch (err: any) {
      console.error('Clear cart error:', err);
    }
  };

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, loading, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
};
