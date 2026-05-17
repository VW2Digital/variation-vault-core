import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Boxes, Package } from 'lucide-react';

interface ComboCard {
  id: string;
  name: string;
  subtitle: string;
  slug: string;
  image_url: string;
  price: number;
  compare_price: number;
  combo_items: { quantity: number; product_id: string; variation_id: string | null; sort_order: number }[];
}

interface ProductLite { id: string; name: string; images: string[] | null; }
interface VariationLite { id: string; product_id: string; image_url: string | null; images: string[] | null; }

interface ProductInfo { name: string; image: string }

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CombosSection() {
  const [combos, setCombos] = useState<ComboCard[]>([]);
  const [products, setProducts] = useState<Record<string, ProductInfo>>({});
  const [variations, setVariations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('combos' as any)
        .select('id, name, subtitle, slug, image_url, price, compare_price, combo_items(quantity, product_id, variation_id, sort_order)')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (!error && data) {
        const rows = data as any as ComboCard[];
        setCombos(rows);
        const allItems = rows.flatMap((c) => c.combo_items || []);
        const pids = Array.from(new Set(allItems.map((i) => i.product_id)));
        const vids = Array.from(new Set(allItems.map((i) => i.variation_id).filter(Boolean) as string[]));
        if (pids.length > 0) {
          const { data: prods } = await supabase
            .from('products')
            .select('id, name, images')
            .in('id', pids);
          const map: Record<string, ProductInfo> = {};
          (prods as ProductLite[] | null)?.forEach((p) => {
            const img = (p.images || []).find((u) => u && !/placeholder/i.test(u)) || '';
            map[p.id] = { name: p.name, image: img };
          });
          setProducts(map);
        }
        if (vids.length > 0) {
          const { data: vars } = await supabase
            .from('product_variations')
            .select('id, product_id, image_url, images')
            .in('id', vids);
          const vmap: Record<string, string> = {};
          (vars as VariationLite[] | null)?.forEach((v) => {
            const fromArr = (v.images || []).find(Boolean) || '';
            vmap[v.id] = fromArr || v.image_url || '';
          });
          setVariations(vmap);
        }
      }
      setLoading(false);
    })();
  }, []);

  if (loading || combos.length === 0) return null;

  return (
    <section className="py-10 bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent">
      <div className="max-w-7xl mx-auto px-[5px]">
        <div className="flex items-center gap-3 mb-6 px-2">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Combos em destaque</h2>
            <p className="text-sm text-muted-foreground">Pacotes com preço promocional fechado</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {combos.map((c) => {
            const discount = c.compare_price > c.price
              ? Math.round(((c.compare_price - c.price) / c.compare_price) * 100)
              : 0;
            const items = [...(c.combo_items || [])].sort(
              (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
            );
            const previewItems = items.slice(0, 4);
            const extraCount = Math.max(0, items.length - previewItems.length);
            const tileGridClass =
              previewItems.length === 1
                ? 'grid-cols-1 grid-rows-1'
                : previewItems.length === 2
                ? 'grid-cols-2 grid-rows-1'
                : previewItems.length === 3
                ? 'grid-cols-2 grid-rows-2'
                : 'grid-cols-2 grid-rows-2';
            return (
              <Link key={c.id} to={`/combo/${c.slug}`} className="group block">
                <div className="relative h-full flex flex-col rounded-xl border bg-card p-4 hover:shadow-lg hover:border-primary/40 transition-all duration-200">
                  {discount > 0 && (
                    <div className="absolute top-3 right-3 z-10 bg-primary text-primary-foreground px-2 py-0.5 rounded-md text-[11px] font-bold">
                      -{discount}%
                    </div>
                  )}
                  <h3 className="font-bold text-foreground text-base sm:text-lg leading-tight line-clamp-2 pr-12 mb-3 group-hover:text-primary transition-colors">
                    {c.name}
                  </h3>

                  <div className={`grid ${tileGridClass} gap-2 mb-3`}>
                    {previewItems.map((it, idx) => {
                      const info = products[it.product_id];
                      const variationImage = it.variation_id ? variations[it.variation_id] : '';
                      const imageSrc = variationImage || info?.image || '';
                      const isLastWithMore = extraCount > 0 && idx === previewItems.length - 1;
                      return (
                        <div
                          key={`${it.product_id}-${idx}`}
                          className="relative aspect-square rounded-lg bg-muted overflow-hidden border border-border/60"
                          title={info?.name}
                        >
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={info?.name || ''}
                              loading="lazy"
                              className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <Package className="w-8 h-8" />
                            </div>
                          )}
                          {it.quantity > 1 && (
                            <span className="absolute top-1 left-1 bg-background/90 text-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
                              {it.quantity}x
                            </span>
                          )}
                          {isLastWithMore && (
                            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
                              <span className="text-foreground font-bold text-lg">+{extraCount}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-auto space-y-1">
                    {c.subtitle && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{c.subtitle}</p>
                    )}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-primary font-bold text-xl">{fmtBRL(c.price)}</span>
                      {c.compare_price > 0 && c.compare_price > c.price && (
                        <span className="text-xs text-muted-foreground line-through">
                          {fmtBRL(c.compare_price)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {items.length} {items.length === 1 ? 'item' : 'itens'} no combo
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}