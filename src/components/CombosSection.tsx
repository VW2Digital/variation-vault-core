import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Boxes, ArrowRight } from 'lucide-react';

interface ComboCard {
  id: string;
  name: string;
  subtitle: string;
  slug: string;
  image_url: string;
  price: number;
  compare_price: number;
  combo_items: { quantity: number; product_id: string }[];
}

interface ProductLite { id: string; name: string; }

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CombosSection() {
  const [combos, setCombos] = useState<ComboCard[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('combos' as any)
        .select('id, name, subtitle, slug, image_url, price, compare_price, combo_items(quantity, product_id)')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (!error && data) {
        const rows = data as any as ComboCard[];
        setCombos(rows);
        const pids = Array.from(new Set(rows.flatMap((c) => (c.combo_items || []).map((i) => i.product_id))));
        if (pids.length > 0) {
          const { data: prods } = await supabase.from('products').select('id, name').in('id', pids);
          const map: Record<string, string> = {};
          (prods as ProductLite[] | null)?.forEach((p) => { map[p.id] = p.name; });
          setProducts(map);
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
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Boxes className="w-6 h-6 text-primary" />
          </div>
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
            const itemsLabel = (c.combo_items || [])
              .map((i) => `${i.quantity}x ${products[i.product_id] || 'item'}`)
              .join(' + ');
            return (
              <Link key={c.id} to={`/combo/${c.slug}`} className="group">
                <div className="rounded-xl border-2 border-primary/20 bg-card overflow-hidden hover:shadow-xl hover:border-primary/40 transition-all duration-300 relative h-full flex flex-col">
                  {discount > 0 && (
                    <div className="absolute top-0 right-0 z-10 bg-primary text-primary-foreground px-3 py-1 rounded-bl-xl text-xs font-bold">
                      -{discount}%
                    </div>
                  )}
                  <Badge className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground">COMBO</Badge>
                  <div className="aspect-[16/10] bg-muted overflow-hidden">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Boxes className="w-12 h-12" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-2 flex-1 flex flex-col">
                    <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{c.name}</h3>
                    {c.subtitle && <p className="text-xs text-muted-foreground line-clamp-1">{c.subtitle}</p>}
                    {itemsLabel && (
                      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{itemsLabel}</p>
                    )}
                    <div className="space-y-0.5 pt-1">
                      {c.compare_price > 0 && c.compare_price > c.price && (
                        <p className="text-xs text-muted-foreground line-through">{fmtBRL(c.compare_price)}</p>
                      )}
                      <p className="text-primary font-bold text-xl">{fmtBRL(c.price)}</p>
                    </div>
                    <Button size="sm" className="w-full mt-2">
                      Comprar combo <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
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