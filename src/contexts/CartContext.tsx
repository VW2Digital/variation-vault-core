import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
}

interface CartContextType {
  items: CartItem[];
  loading: boolean;
  addToCart: (productId: string, variationId: string, quantity?: number) => Promise<void>;
  removeFromCart: (variationId: string) => Promise<void>;
  updateQuantity: (variationId: string, quantity: number) => Promise<void>;
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

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchCart = useCallback(async () => {
    if (!userId) { setItems([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('id, product_id, variation_id, quantity')
        .eq('user_id', userId);
      if (error) throw error;

      if (!data || data.length === 0) { setItems([]); return; }

      // Fetch product + variation details
      const varIds = data.map(i => i.variation_id);
      const prodIds = [...new Set(data.map(i => i.product_id))];

      const [{ data: variations }, { data: products }] = await Promise.all([
        supabase.from('product_variations').select('id, dosage, price, image_url, images, in_stock').in('id', varIds),
        supabase.from('products').select('id, name, images').in('id', prodIds),
      ]);

      const varMap = new Map((variations || []).map(v => [v.id, v]));
      const prodMap = new Map((products || []).map(p => [p.id, p]));

      const enriched: CartItem[] = data.map(ci => {
        const v = varMap.get(ci.variation_id);
        const p = prodMap.get(ci.product_id);
        return {
          id: ci.id,
          product_id: ci.product_id,
          variation_id: ci.variation_id,
          quantity: ci.quantity,
          product_name: p?.name || '',
          dosage: v?.dosage || '',
          price: Number(v?.price || 0),
          image_url: v?.images?.[0] || v?.image_url || p?.images?.[0] || '',
          in_stock: v?.in_stock ?? false,
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
    if (!userId) {
      toast({ title: 'Faça login para adicionar ao carrinho', variant: 'destructive' });
      return;
    }
    try {
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
      toast({ title: 'Adicionado ao carrinho!' });
    } catch (err: any) {
      toast({ title: 'Erro ao adicionar', description: err.message, variant: 'destructive' });
    }
  };

  const removeFromCart = async (variationId: string) => {
    if (!userId) return;
    try {
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
    if (!userId || quantity < 1) return;
    try {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity })
        .eq('user_id', userId)
        .eq('variation_id', variationId);
      if (error) throw error;
      await fetchCart();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    }
  };

  const clearCart = async () => {
    if (!userId) return;
    try {
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
