import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchProduct } from '@/lib/api';
import { AnimatedSection } from '@/components/AnimatedSection';
import CheckoutForm from '@/components/CheckoutForm';
import logoImg from '@/assets/liberty-pharma-logo.png';
import productHeroImg from '@/assets/product-hero.png';
import { ChevronLeft } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';

const Checkout = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariation, setSelectedVariation] = useState(0);
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
    fetchProduct(id).then((prod) => {
      setProduct(prod);
      const vId = searchParams.get('v');
      if (vId && prod.product_variations) {
        const idx = prod.product_variations.findIndex((v: any) => v.id === vId);
        if (idx >= 0) setSelectedVariation(idx);
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
  const unitPrice = Number(variation?.price || 0);
  const totalPrice = unitPrice * quantity;

  const variationImages = variation?.images?.length > 0
    ? variation.images
    : variation?.image_url
      ? [variation.image_url]
      : [];
  const mainImage = variationImages.length > 0 ? variationImages[0] : productHeroImg;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/catalogo" className="flex items-center gap-2">
            <img src={logoImg} alt="Liberty Pharma" className="h-10 object-contain" />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to={`/produto/${id}?v=${variation?.id || ''}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> {t('backToProduct')}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

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
                <p className="font-semibold text-foreground">{product.name}</p>
                <p className="text-sm text-muted-foreground">{variation?.dosage}</p>
                <p className="text-sm text-muted-foreground">{t('qty')}: {quantity}</p>
              </div>
              <p className="text-xl font-bold text-primary">
                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Checkout Form */}
          <CheckoutForm
            productName={product.name}
            dosage={variation?.dosage || ''}
            quantity={quantity}
            unitPrice={unitPrice}
          />
        </AnimatedSection>
      </section>
    </div>
  );
};

export default Checkout;
