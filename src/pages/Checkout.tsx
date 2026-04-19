import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchProduct } from '@/lib/api';
import { gtagBeginCheckout } from '@/lib/gtag';
import { fbInitiateCheckout } from '@/lib/fbPixel';
import { AnimatedSection } from '@/components/AnimatedSection';
import CheckoutForm from '@/components/CheckoutForm';
import Header from '@/components/Header';
import { getEffectivePrice, WholesaleTier } from '@/contexts/CartContext';
import Footer from '@/components/Footer';
import productHeroImg from '@/assets/product-hero.png';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';

const Checkout = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariation, setSelectedVariation] = useState(0);
  const [wholesaleTiers, setWholesaleTiers] = useState<WholesaleTier[]>([]);
  const quantity = Number(searchParams.get('qty')) || 1;

  useEffect(() => {
    // Auth guard - redirect to login if not authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        const currentUrl = window.location.pathname + window.location.search;
        navigate(`/cliente/login?redirect=${encodeURIComponent(currentUrl)}`);
        return;
      }
    });

    if (!id) return;
    fetchProduct(id).then(async (prod) => {
      setProduct(prod);
      // Google Ads: begin_checkout
      const v0 = prod.product_variations?.[0];
      const chkPrice = v0?.is_offer && v0?.offer_price ? Number(v0.offer_price) : Number(v0?.price || 0);
      gtagBeginCheckout(chkPrice, [{ id: prod.id, name: prod.name, price: chkPrice, quantity: 1 }]);
      fbInitiateCheckout(chkPrice, [{ id: prod.id, name: prod.name, price: chkPrice, quantity: 1 }]);
      const vId = searchParams.get('v');
      let variationId = prod.product_variations?.[0]?.id;
      if (vId && prod.product_variations) {
        const idx = prod.product_variations.findIndex((v: any) => v.id === vId);
        if (idx >= 0) { setSelectedVariation(idx); variationId = vId; }
      }
      // Fetch wholesale prices for selected variation
      if (variationId) {
        const { data: wpData } = await supabase
          .from('wholesale_prices')
          .select('*')
          .eq('variation_id', variationId)
          .order('min_quantity', { ascending: true });
        setWholesaleTiers((wpData || []).map((w: any) => ({ min_quantity: w.min_quantity, price: Number(w.price) })));
      }
    }).finally(() => setLoading(false));
  }, [id, searchParams, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t('productNotFound')}</p>
      </div>
    );
  }

  const variations = product.product_variations || [];
  const variation = variations[selectedVariation];
  const originalPrice = Number(variation?.price || 0);
  const basePrice = variation?.is_offer && variation?.offer_price ? Number(variation.offer_price) : originalPrice;
  const unitPrice = getEffectivePrice(basePrice, quantity, wholesaleTiers);
  const totalPrice = unitPrice * quantity;

  const variationImages = variation?.images?.length > 0
    ? variation.images
    : variation?.image_url
      ? [variation.image_url]
      : [];
  const mainImage = variationImages.length > 0 ? variationImages[0] : productHeroImg;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="max-w-3xl mx-auto px-4 py-8">
        <AnimatedSection variant="fadeUp">
          {/* Order Summary */}
          <div className="border border-border/50 rounded-xl p-5 bg-card mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4">{t('orderSummary')}</h2>
            <div className="flex items-center gap-4">
              <img
                src={mainImage}
                alt={product.name}
                className="w-20 h-20 object-contain rounded-lg border border-border/50 bg-muted p-1"
              />
              <div className="flex-1">
                <p className="font-bold text-foreground">{product.name}</p>
                {variation?.dosage && !product.name.toLowerCase().includes(variation.dosage.toLowerCase()) && (
                  <p className="text-sm text-muted-foreground">{variation.dosage}</p>
                )}
                <p className="text-sm text-muted-foreground">{t('qty')}: {quantity}</p>
              </div>
              <div className="text-right">
                {variation?.is_offer && variation?.offer_price ? (
                  <>
                    <p className="text-sm text-muted-foreground line-through">
                      R$ {(originalPrice * quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xl font-bold text-destructive">
                      R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </>
                ) : unitPrice < basePrice ? (
                  <>
                    <p className="text-sm text-muted-foreground line-through">
                      R$ {(basePrice * quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xl font-bold text-primary">
                      R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </>
                ) : (
                  <p className="text-xl font-bold text-primary">
                    R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>

            {/* Savings Calculator */}
            {(() => {
              const savings = (basePrice * quantity) - totalPrice;
              if (savings <= 0) return null;
              return (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between bg-success/10 rounded-lg px-4 py-2.5">
                    <span className="text-sm font-medium text-success">💰 Você está economizando</span>
                    <span className="text-lg font-bold text-success">
                      R$ {savings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Checkout Form */}
          <CheckoutForm
            productName={product.name}
            productId={product.id}
            paymentDescription={(product as any).fantasy_name || undefined}
            dosage={variation?.dosage || ''}
            quantity={quantity}
            unitPrice={unitPrice}
            freeShipping={product.free_shipping}
            freeShippingMinValue={Number(product.free_shipping_min_value) || 0}
            pixDiscountPercentProp={Number(product.pix_discount_percent) || 0}
            maxInstallmentsProp={Number(product.max_installments) || 6}
            installmentsInterestProp={product.installments_interest || 'sem_juros'}
          />
        </AnimatedSection>
      </section>
      <Footer />
    </div>
  );
};

export default Checkout;
