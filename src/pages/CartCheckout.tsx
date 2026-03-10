import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useCart, getEffectivePrice } from '@/contexts/CartContext';
import CheckoutForm from '@/components/CheckoutForm';
import { AnimatedSection } from '@/components/AnimatedSection';
import Header from '@/components/Header';
import productHeroImg from '@/assets/product-hero.png';

const CartCheckout = () => {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart, loading } = useCart();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate(`/cliente/login?redirect=${encodeURIComponent('/checkout-carrinho')}`);
      }
    });
  }, [navigate]);

  // Only redirect to cart if items are empty AND cart has finished loading
  useEffect(() => {
    if (!loading && items.length === 0 && !ready) {
      navigate('/carrinho');
    }
    if (!loading && items.length > 0) {
      setReady(true);
    }
  }, [loading, items, navigate, ready]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Build a combined product name and total for CheckoutForm
  const productName = items.map(i => `${i.product_name} ${i.dosage} x${i.quantity}`).join(', ');
  const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="max-w-3xl mx-auto px-4 py-8">
        <AnimatedSection variant="fadeUp">
          {/* Order Summary */}
          <div className="border border-border/50 rounded-xl p-5 bg-card mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4">Resumo do Pedido</h2>
            <div className="space-y-3">
              {items.map((item) => {
                const originalTotal = item.original_price * item.quantity;
                const effectiveTotal = item.price * item.quantity;
                const hasSavings = effectiveTotal < originalTotal;
                return (
                  <div key={item.variation_id} className="flex items-center gap-4">
                    <img
                      src={item.image_url || productHeroImg}
                      alt={item.product_name}
                      className="w-14 h-14 object-contain rounded-lg border border-border/50 bg-muted p-1"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-foreground text-sm">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.dosage} — Qtd: {item.quantity}</p>
                      {item.wholesale_prices.length > 0 && item.price < (item.is_offer ? (item.original_price * (item.is_offer ? 1 : 1)) : item.original_price) && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 text-[10px] mt-1">
                          Atacado aplicado
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      {hasSavings && (
                        <p className="text-xs text-muted-foreground line-through">
                          R$ {originalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      <p className={`font-bold text-sm ${hasSavings ? 'text-primary' : item.is_offer ? 'text-destructive' : 'text-primary'}`}>
                        R$ {effectiveTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Savings Calculator */}
            {(() => {
              const totalOriginal = items.reduce((sum, item) => sum + item.original_price * item.quantity, 0);
              const totalSavings = totalOriginal - totalPrice;
              if (totalSavings <= 0) return null;
              return (
                <div className="border-t border-border mt-4 pt-3">
                  <div className="flex items-center justify-between bg-success/10 rounded-lg px-4 py-2.5 mb-3">
                    <span className="text-sm font-medium text-success">💰 Você está economizando</span>
                    <span className="text-lg font-bold text-success">
                      R$ {totalSavings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="border-t border-border mt-4 pt-3 flex justify-between font-bold">
              <span className="text-foreground">Total</span>
              <span className="text-primary text-lg">
                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Checkout Form - uses total price as unit price with qty 1 */}
          <CheckoutForm
            productName={productName}
            dosage=""
            quantity={1}
            unitPrice={totalPrice}
          />
        </AnimatedSection>
      </section>
    </div>
  );
};

export default CartCheckout;
