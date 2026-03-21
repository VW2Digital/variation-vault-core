import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/AnimatedSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShoppingCart, CircleCheck, ArrowRight, Flame, Sparkles } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BannerCarousel from '@/components/BannerCarousel';
import CountdownTimer from '@/components/CountdownTimer';
import productHeroImg from '@/assets/product-hero.png';

const Index = () => {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  // Get offer items
  const offerItems = products.flatMap((product) => {
    const vars = product.product_variations || [];
    return vars
      .filter((v: any) => v.is_offer && v.offer_price && v.in_stock)
      .map((variation: any) => ({ product, variation }));
  });

  // Get newest items (non-offer)
  const newestItems = products
    .flatMap((product) => {
      const vars = product.product_variations || [];
      if (vars.length === 0) return [{ product, variation: null }];
      return vars.map((variation: any) => ({ product, variation }));
    })
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />
      <BannerCarousel />

      {/* Offers Section */}
      {!loading && offerItems.length > 0 && (
        <section className="py-12 bg-gradient-to-b from-destructive/5 via-destructive/[0.02] to-transparent">
          <div className="max-w-7xl mx-auto px-[5px]">
            <AnimatedSection variant="fadeUp">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Flame className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                      Ofertas do Dia
                    </h2>
                    <p className="text-sm text-muted-foreground">Aproveite antes que acabe!</p>
                  </div>
                </div>
                <CountdownTimer variant="full" />
              </div>
            </AnimatedSection>

            <StaggerContainer className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-2.5">
              {offerItems.map(({ product, variation }, idx) => {
                const price = Number(variation.price);
                const offerPrice = Number(variation.offer_price);
                const discount = Math.round(((price - offerPrice) / price) * 100);
                const img = variation.images?.[0] || variation.image_url || product.images?.[0] || productHeroImg;
                const displayName = `${product.name} ${variation.dosage}`;

                return (
                  <StaggerItem key={variation.id || `offer-${idx}`}>
                    <div className="group rounded-xl border-2 border-destructive/20 bg-card overflow-hidden hover:shadow-xl hover:border-destructive/40 transition-all duration-300 relative">
                      {/* Offer ribbon */}
                      <div className="absolute top-0 right-0 z-10 bg-destructive text-destructive-foreground px-3 py-1 rounded-bl-xl text-xs font-bold">
                        -{discount}%
                      </div>

                      <Link
                        to={`/produto/${product.id}?v=${variation.id}`}
                        className="block"
                      >
                        <div className="relative aspect-[4/3] sm:aspect-square bg-muted/30 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
                          <img
                            src={img}
                            alt={displayName}
                            className="max-w-[75%] max-h-[75%] object-contain group-hover:scale-110 transition-transform duration-500"
                          />
                        </div>

                        <div className="p-3 sm:p-4 space-y-1 sm:space-y-2">
                          <h3 className="font-semibold text-foreground text-xs sm:text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                            {displayName}
                          </h3>
                          {(variation.subtitle || product.subtitle) && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{variation.subtitle || product.subtitle}</p>
                          )}
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs line-through">
                              R$ {price.toLocaleString('pt-BR')}
                            </p>
                            <p className="text-destructive font-bold text-lg sm:text-xl">
                              R$ {offerPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                            <CountdownTimer variant="compact" />
                          </div>
                        </div>
                      </Link>

                      <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { data: { session } } = await supabase.auth.getSession();
                            if (!session) {
                              navigate(`/cliente/login?redirect=${encodeURIComponent('/catalogo')}`);
                              return;
                            }
                            addToCart(product.id, variation.id, 1);
                          }}
                        >
                          <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                          Comprar Agora
                        </Button>
                      </div>
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </section>
      )}



      <Footer />
    </div>
  );
};

export default Index;
