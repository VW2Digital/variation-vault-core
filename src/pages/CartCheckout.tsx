import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useCart, getEffectivePrice } from '@/contexts/CartContext';
import CheckoutForm from '@/components/CheckoutForm';
import { AnimatedSection } from '@/components/AnimatedSection';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import productHeroImg from '@/assets/product-hero.png';

const CartCheckout = () => {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart, loading } = useCart();
  const [ready, setReady] = useState(false);
  const [freeShippingInfo, setFreeShippingInfo] = useState<{ freeShipping: boolean; minValue: number }>({ freeShipping: false, minValue: 0 });

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

  // Fetch free shipping info from products in cart
  useEffect(() => {
    if (items.length === 0) return;
    const productIds = [...new Set(items.map(i => i.product_id))];
    supabase
      .from('products')
      .select('id, free_shipping, free_shipping_min_value')
      .in('id', productIds)
      .then(({ data }) => {
        if (!data) return;
        // If any product offers free shipping and total meets the lowest min value
        const freeShippingProducts = data.filter((p: any) => p.free_shipping);
        if (freeShippingProducts.length > 0) {
          const minValue = Math.min(...freeShippingProducts.map((p: any) => Number(p.free_shipping_min_value) || 0));
          setFreeShippingInfo({ freeShipping: true, minValue });
        }
      });
  }, [items]);

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
              <div className="space-y-4">
                {items.map((item) => {
                  const basePrice = item.is_offer ? item.price : item.original_price;
                  const effectiveUnit = getEffectivePrice(basePrice, item.quantity, item.wholesale_prices);
                  const effectiveTotal = effectiveUnit * item.quantity;
                  const regularTotal = basePrice * item.quantity;
                  const hasWholesaleDiscount = effectiveUnit < basePrice;
                  const discountPct = basePrice > 0 ? Math.round(((basePrice - effectiveUnit) / basePrice) * 100) : 0;

                  return (
                    <div key={item.variation_id} className="space-y-2">
                      <div className="flex items-center gap-4">
                        <img
                          src={item.image_url || productHeroImg}
                          alt={item.product_name}
                          className="w-14 h-14 object-contain rounded-lg border border-border/50 bg-muted p-1"
                        />
                        <div className="flex-1">
                          <p className="font-bold text-foreground text-sm" style={{ fontFamily: 'Georgia, serif' }}>{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{item.dosage}</p>
                        </div>
                      </div>

                      {hasWholesaleDiscount ? (
                        <div className="ml-[4.5rem] space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 text-[10px]">
                              Atacado
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] text-destructive bg-destructive/10 border-destructive/20">
                              -{discountPct}%
                            </Badge>
                          </div>
                          <div className="border border-success/20 rounded-lg p-3 bg-success/5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {item.quantity}x R$ {effectiveUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (por unidade)
                              </span>
                              <span className="font-bold text-sm text-primary">
                                R$ {effectiveTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-muted-foreground">
                                Preço regular: <span className="line-through">R$ {regularTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </span>
                              <span className="text-[11px] text-success font-semibold">
                                Economia: R$ {(regularTotal - effectiveTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="ml-[4.5rem] flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Qtd: {item.quantity}</span>
                          <span className={`font-bold text-sm ${item.is_offer ? 'text-destructive' : 'text-primary'}`}>
                            R$ {effectiveTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Total Savings */}
              {(() => {
                const totalRegular = items.reduce((sum, item) => {
                  const base = item.is_offer ? item.price : item.original_price;
                  return sum + base * item.quantity;
                }, 0);
                const totalSavings = totalRegular - totalPrice;
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
            freeShipping={freeShippingInfo.freeShipping}
            freeShippingMinValue={freeShippingInfo.minValue}
          />
        </AnimatedSection>
      </section>
      <Footer />
    </div>
  );
};

export default CartCheckout;
