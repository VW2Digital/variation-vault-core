import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gtagBeginCheckout } from '@/lib/gtag';
import { fbInitiateCheckout } from '@/lib/fbPixel';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import CheckoutForm from '@/components/CheckoutForm';
import UpsellSection from '@/components/UpsellSection';
import { AnimatedSection } from '@/components/AnimatedSection';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CheckoutAuthGate from '@/components/CheckoutAuthGate';
import productHeroImg from '@/assets/product-hero.png';
import { useToast } from '@/hooks/use-toast';

const CartCheckout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, totalPrice, clearCart, loading } = useCart();
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [freeShippingInfo, setFreeShippingInfo] = useState<{ freeShipping: boolean; minValue: number }>({ freeShipping: false, minValue: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Only redirect to cart if items are empty AND cart has finished loading
  useEffect(() => {
    if (!loading && items.length === 0 && !ready) {
      navigate('/carrinho');
    }
    if (!loading && items.length > 0) {
      setReady(true);
      // Google Ads: begin_checkout
      const checkoutValue = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const checkoutItems = items.map(i => ({ id: i.product_id, name: i.product_name, price: i.price, quantity: i.quantity }));
      gtagBeginCheckout(checkoutValue, checkoutItems);
      fbInitiateCheckout(checkoutValue, checkoutItems);
    }
  }, [loading, items, navigate, ready]);

  // Fetch free shipping and payment info from products in cart
  const [cartPaymentSettings, setCartPaymentSettings] = useState<{ pixDiscount: number; maxInstallments: number; installmentsInterest: string }>({ pixDiscount: 0, maxInstallments: 6, installmentsInterest: 'sem_juros' });
  const [productFantasyNames, setProductFantasyNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (items.length === 0) return;
    const productIds = [...new Set(items.map(i => i.product_id))];
    supabase
      .from('products')
      .select('id, name, active, free_shipping, free_shipping_min_value, pix_discount_percent, max_installments, installments_interest, fantasy_name')
      .in('id', productIds)
      .then(({ data }) => {
        if (!data) return;
        // Block checkout if any product is inactive
        const inactive = data.filter((p: any) => p.active === false);
        if (inactive.length > 0) {
          toast({
            title: 'Produto indisponível',
            description: `${inactive.map((p: any) => p.name).join(', ')} não está mais disponível. Remova do carrinho para continuar.`,
            variant: 'destructive',
          });
          navigate('/carrinho');
          return;
        }
        // Build fantasy name map
        const nameMap: Record<string, string> = {};
        data.forEach((p: any) => {
          if (p.fantasy_name) nameMap[p.id] = p.fantasy_name;
        });
        setProductFantasyNames(nameMap);
        // Free shipping
        const freeShippingProducts = data.filter((p: any) => p.free_shipping);
        if (freeShippingProducts.length > 0) {
          const minValue = Math.max(...freeShippingProducts.map((p: any) => Number(p.free_shipping_min_value) || 0));
          setFreeShippingInfo({ freeShipping: true, minValue });
        }
        // Payment: use best PIX discount and max installments from cart products
        const bestPixDiscount = Math.max(...data.map((p: any) => Number(p.pix_discount_percent) || 0));
        const bestMaxInstallments = Math.max(...data.map((p: any) => Number(p.max_installments) || 6));
        // If any product has "com_juros", use that
        const hasComJuros = data.some((p: any) => p.installments_interest === 'com_juros');
        setCartPaymentSettings({
          pixDiscount: bestPixDiscount,
          maxInstallments: bestMaxInstallments,
          installmentsInterest: hasComJuros ? 'com_juros' : 'sem_juros',
        });
      });
  }, [items, navigate, toast]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Build a combined product name, dosage and total for CheckoutForm
  const productName = items.map(i => {
    const dosageSuffix = i.dosage && !i.product_name.toLowerCase().includes(i.dosage.toLowerCase()) ? ` ${i.dosage}` : '';
    return `${i.product_name}${dosageSuffix} x${i.quantity}`;
  }).join(', ');
  // Build payment description using fantasy names when available
  const paymentDesc = items.map(i => {
    const displayName = productFantasyNames[i.product_id] || i.product_name;
    const dosageSuffix = i.dosage && !displayName.toLowerCase().includes(i.dosage.toLowerCase()) ? ` ${i.dosage}` : '';
    return `${displayName}${dosageSuffix} x${i.quantity}`;
  }).join(', ');
  const hasFantasyNames = Object.keys(productFantasyNames).length > 0;
  const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
  // Build combined dosage string from all items
  const combinedDosage = [...new Set(items.map(i => i.dosage).filter(Boolean))].join(', ');

  // Wholesale minimum guard: block submission if any cart item is below its lowest tier
  const wholesaleViolations = items
    .filter(i => i.wholesale_prices && i.wholesale_prices.length > 0)
    .map(i => {
      const minRequired = Math.min(...i.wholesale_prices.map(t => t.min_quantity));
      return { item: i, minRequired, ok: i.quantity >= minRequired };
    })
    .filter(v => !v.ok);
  const hasWholesaleViolation = wholesaleViolations.length > 0;

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
                  // Single source of truth: item.price is the effective unit
                  // (offer + wholesale tier already applied by CartContext.fetchCart)
                  const effectiveUnit = item.price;
                  const effectiveTotal = effectiveUnit * item.quantity;
                  // Reference price = original catalog price (no offer, no wholesale).
                  // Used to render strike-through and discount %.
                  const referenceUnit = item.original_price;
                  const referenceTotal = referenceUnit * item.quantity;
                  const hasWholesaleDiscount = item.wholesale_prices.length > 0
                    && item.quantity >= Math.min(...item.wholesale_prices.map(t => t.min_quantity));
                  const discountPct = referenceUnit > 0
                    ? Math.round(((referenceUnit - effectiveUnit) / referenceUnit) * 100)
                    : 0;

                  return (
                    <div key={item.variation_id} className="space-y-2">
                      <div className="flex items-center gap-4">
                        <img
                          src={item.image_url || productHeroImg}
                          alt={item.product_name}
                          className="w-14 h-14 object-contain rounded-lg border border-border/50 bg-muted p-1"
                        />
                        <div className="flex-1">
                          <p className="font-bold text-foreground text-sm">{item.product_name}</p>
                          {item.dosage && !item.product_name.toLowerCase().includes(item.dosage.toLowerCase()) && (
                            <p className="text-xs text-muted-foreground">{item.dosage}</p>
                          )}
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
                                Preço regular: <span className="line-through">R$ {referenceTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </span>
                              <span className="text-[11px] text-success font-semibold">
                                Economia: R$ {(referenceTotal - effectiveTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                // Compare against the original catalog price (single reference)
                const totalRegular = items.reduce(
                  (sum, item) => sum + item.original_price * item.quantity,
                  0,
                );
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

          {/* Upsell Section - suggested products before payment */}
          <UpsellSection />

          {/* Auth gate: show login/signup if not authenticated */}
          {isAuthenticated === false && (
            <CheckoutAuthGate onAuthenticated={() => setIsAuthenticated(true)} />
          )}

          {/* Checkout Form - only render once user is authenticated */}
          {isAuthenticated && hasWholesaleViolation && (
            <div className="border border-destructive/30 bg-destructive/5 rounded-xl p-5 space-y-3 mb-6">
              <p className="text-sm font-semibold text-destructive">
                Quantidade abaixo do mínimo de atacado
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                {wholesaleViolations.map(v => (
                  <li key={v.item.variation_id}>
                    <strong>{v.item.product_name}</strong>
                    {v.item.dosage ? ` (${v.item.dosage})` : ''} exige pelo menos{' '}
                    <strong>{v.minRequired} unidades</strong>. Você tem {v.item.quantity}.
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/carrinho')}
                className="text-sm text-primary underline hover:no-underline"
              >
                Ajustar quantidades no carrinho
              </button>
            </div>
          )}
          {isAuthenticated && !hasWholesaleViolation && (
            <CheckoutForm
            productName={productName}
            paymentDescription={hasFantasyNames ? paymentDesc : undefined}
            dosage={combinedDosage}
            quantity={totalQuantity}
            unitPrice={Math.round((totalPrice / totalQuantity) * 100) / 100}
            freeShipping={freeShippingInfo.freeShipping}
            freeShippingMinValue={freeShippingInfo.minValue}
            pixDiscountPercentProp={cartPaymentSettings.pixDiscount}
            maxInstallmentsProp={cartPaymentSettings.maxInstallments}
            installmentsInterestProp={cartPaymentSettings.installmentsInterest}
            />
          )}
        </AnimatedSection>
      </section>
      <Footer />
    </div>
  );
};

export default CartCheckout;
