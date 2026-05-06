import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { AnimatedSection } from '@/components/AnimatedSection';
import { Skeleton } from '@/components/ui/skeleton';
import productHeroImg from '@/assets/product-hero.png';

interface RecVariation {
  id: string;
  dosage: string;
  price: number;
  offer_price: number;
  is_offer: boolean;
  in_stock: boolean;
  image_url: string | null;
  images: string[] | null;
}

interface RecProduct {
  id: string;
  name: string;
  subtitle: string | null;
  images: string[] | null;
  variations: RecVariation[];
}

interface Props {
  productId: string;
}

const getSessionId = (): string => {
  try {
    const KEY = 'rec_session_id';
    let sid = sessionStorage.getItem(KEY);
    if (!sid) {
      sid = (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return 'anon';
  }
};

const ProductRecommendations = ({ productId }: Props) => {
  const [items, setItems] = useState<RecProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      setLoading(true);
      try {
        const { data: assoc } = await supabase
          .from('product_upsells' as any)
          .select('upsell_product_id, upsell_variation_id, sort_order')
          .eq('product_id', productId)
          .order('sort_order', { ascending: true });

        const assocList = ((assoc as any[]) || []).filter(
          a => a.upsell_product_id && a.upsell_product_id !== productId
        );
        const preferredVariation = new Map<string, string>();
        assocList.forEach(a => {
          if (a.upsell_variation_id) {
            preferredVariation.set(a.upsell_product_id, a.upsell_variation_id);
          }
        });
        const ids = [...new Set(assocList.map(a => a.upsell_product_id))];

        if (ids.length === 0) {
          setItems([]);
          return;
        }

        const { data: products } = await supabase
          .from('products')
          .select('id, name, subtitle, images, product_variations(id, dosage, price, offer_price, is_offer, in_stock, image_url, images)')
          .in('id', ids);

        const enriched: RecProduct[] = ((products as any[]) || [])
          .map(p => {
            const allVars = (p.product_variations || [])
              .filter((v: any) => v.in_stock)
              .map((v: any) => ({
                id: v.id,
                dosage: v.dosage,
                price: Number(v.price),
                offer_price: Number(v.offer_price || 0),
                is_offer: v.is_offer,
                in_stock: v.in_stock,
                image_url: v.image_url,
                images: v.images,
              }));
            const preferredId = preferredVariation.get(p.id);
            const ordered = preferredId
              ? [
                  ...allVars.filter((v: RecVariation) => v.id === preferredId),
                  ...allVars.filter((v: RecVariation) => v.id !== preferredId),
                ]
              : allVars;
            return {
              id: p.id,
              name: p.name,
              subtitle: p.subtitle,
              images: p.images,
              variations: ordered,
            };
          })
          .filter(p => p.variations.length > 0)
          .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

        setItems(enriched);
      } catch (err) {
        console.error('Recommendations fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [productId]);

  if (loading) {
    return (
      <section className="max-w-6xl mx-auto px-4 py-10" aria-busy="true" aria-label="Carregando recomendações">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-5 h-5 text-primary/40" />
          <Skeleton className="h-6 w-56" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden border-border/50 h-full flex flex-col">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-3 flex-1 flex flex-col gap-2">
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
                <div className="mt-auto pt-2">
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  const handleClick = async (recProductId: string, recVariationId: string, position: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('recommendation_events' as any).insert({
        user_id: user?.id ?? null,
        session_id: getSessionId(),
        source_product_id: productId,
        recommended_product_id: recProductId,
        recommended_variation_id: recVariationId,
        event_type: 'click',
        position,
      });
    } catch (err) {
      console.error('recommendation_events insert error:', err);
    }
  };

  return (
    <AnimatedSection variant="fadeUp" className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Você também pode gostar</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((product, idx) => {
          const variation = product.variations[0];
          const effectivePrice =
            variation.is_offer && variation.offer_price > 0 ? variation.offer_price : variation.price;
          const hasDiscount =
            variation.is_offer && variation.offer_price > 0 && variation.offer_price < variation.price;
          const discountPct = hasDiscount
            ? Math.round(((variation.price - variation.offer_price) / variation.price) * 100)
            : 0;
          const image =
            variation.images?.[0] || variation.image_url || product.images?.[0] || productHeroImg;

          return (
            <Link
              key={product.id}
              to={`/produto/${product.id}?variation=${variation.id}`}
              onClick={() => handleClick(product.id, variation.id, idx)}
            >
              <Card className="group overflow-hidden border-border/50 hover:border-primary/40 hover:shadow-md transition-all h-full flex flex-col">
                <div className="relative aspect-square bg-muted/40 flex items-center justify-center p-3">
                  <img
                    src={image}
                    alt={product.name}
                    className="max-w-[85%] max-h-[85%] object-contain group-hover:scale-105 transition-transform"
                  />
                  {hasDiscount && (
                    <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground text-[10px]">
                      -{discountPct}%
                    </Badge>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <p className="font-bold text-sm text-foreground line-clamp-2 leading-tight">
                    {product.name}
                  </p>
                  {product.subtitle && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{product.subtitle}</p>
                  )}
                  <div className="mt-auto pt-2 flex items-baseline gap-1.5 flex-wrap">
                    {hasDiscount && (
                      <span className="text-[10px] text-muted-foreground line-through">
                        R$ {variation.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    <span
                      className={`font-bold text-base ${hasDiscount ? 'text-destructive' : 'text-primary'}`}
                    >
                      R$ {effectivePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </AnimatedSection>
  );
};

export default ProductRecommendations;