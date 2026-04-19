import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCart, getEffectivePrice } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Sparkles, Check } from 'lucide-react';
import productHeroImg from '@/assets/product-hero.png';

interface UpsellVariation {
  id: string;
  dosage: string;
  price: number;
  offer_price: number;
  is_offer: boolean;
  in_stock: boolean;
  image_url: string | null;
  images: string[] | null;
}

interface UpsellProduct {
  id: string;
  name: string;
  subtitle: string | null;
  images: string[] | null;
  variations: UpsellVariation[];
}

const UpsellSection = () => {
  const { items, addToCart } = useCart();
  const [upsells, setUpsells] = useState<UpsellProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      setLoading(false);
      return;
    }
    const cartProductIds = [...new Set(items.map(i => i.product_id))];
    const cartVariationIds = new Set(items.map(i => i.variation_id));

    (async () => {
      setLoading(true);
      try {
        // Find upsell associations for products in cart
        const { data: assoc } = await supabase
          .from('product_upsells' as any)
          .select('upsell_product_id, sort_order')
          .in('product_id', cartProductIds)
          .order('sort_order', { ascending: true });

        const upsellIds = [
          ...new Set(((assoc as any[]) || []).map(a => a.upsell_product_id)),
        ].filter(id => !cartProductIds.includes(id));

        if (upsellIds.length === 0) {
          setUpsells([]);
          return;
        }

        const { data: products } = await supabase
          .from('products')
          .select('id, name, subtitle, images, product_variations(id, dosage, price, offer_price, is_offer, in_stock, image_url, images)')
          .in('id', upsellIds);

        const enriched: UpsellProduct[] = ((products as any[]) || []).map(p => ({
          id: p.id,
          name: p.name,
          subtitle: p.subtitle,
          images: p.images,
          variations: (p.product_variations || [])
            .filter((v: any) => v.in_stock && !cartVariationIds.has(v.id))
            .map((v: any) => ({
              id: v.id,
              dosage: v.dosage,
              price: Number(v.price),
              offer_price: Number(v.offer_price || 0),
              is_offer: v.is_offer,
              in_stock: v.in_stock,
              image_url: v.image_url,
              images: v.images,
            })),
        })).filter(p => p.variations.length > 0);

        setUpsells(enriched);
        // Default-select first variation
        const defaults: Record<string, string> = {};
        enriched.forEach(p => {
          defaults[p.id] = p.variations[0].id;
        });
        setSelectedVariations(defaults);
      } catch (err) {
        console.error('Upsell fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [items]);

  const handleAdd = async (product: UpsellProduct) => {
    const variationId = selectedVariations[product.id];
    if (!variationId) return;
    setAdding(variationId);
    try {
      await addToCart(product.id, variationId, 1);
    } finally {
      setAdding(null);
    }
  };

  if (loading || upsells.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Leve também</h2>
        <Badge className="bg-primary text-primary-foreground text-[10px]">Oferta especial</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Aproveite e adicione esses produtos com 1 clique antes de finalizar.
      </p>

      <div className="space-y-3">
        {upsells.map(product => {
          const variation = product.variations.find(v => v.id === selectedVariations[product.id]) || product.variations[0];
          const effectivePrice = variation.is_offer && variation.offer_price > 0 ? variation.offer_price : variation.price;
          const hasDiscount = variation.is_offer && variation.offer_price > 0 && variation.offer_price < variation.price;
          const discountPct = hasDiscount ? Math.round(((variation.price - variation.offer_price) / variation.price) * 100) : 0;
          const image = variation.images?.[0] || variation.image_url || product.images?.[0] || productHeroImg;
          const isAdding = adding === variation.id;

          return (
            <div
              key={product.id}
              className="flex items-center gap-3 bg-card border border-border/50 rounded-lg p-3"
            >
              <img
                src={image}
                alt={product.name}
                className="w-16 h-16 object-contain rounded-lg border border-border/50 bg-muted p-1 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground text-sm leading-tight">{product.name}</p>
                {product.subtitle && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{product.subtitle}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {product.variations.length > 1 ? (
                    <Select
                      value={selectedVariations[product.id]}
                      onValueChange={(v) => setSelectedVariations(prev => ({ ...prev, [product.id]: v }))}
                    >
                      <SelectTrigger className="h-7 text-xs w-auto min-w-[90px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {product.variations.map(v => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.dosage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">{variation.dosage}</Badge>
                  )}
                  <div className="flex items-baseline gap-1.5">
                    {hasDiscount && (
                      <span className="text-[10px] text-muted-foreground line-through">
                        R$ {variation.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    <span className={`font-bold text-sm ${hasDiscount ? 'text-destructive' : 'text-primary'}`}>
                      R$ {effectivePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {hasDiscount && (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] h-4 px-1">
                        -{discountPct}%
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => handleAdd(product)}
                disabled={isAdding}
                className="flex-shrink-0 h-9"
              >
                {isAdding ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Adicionar</span>
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default UpsellSection;
