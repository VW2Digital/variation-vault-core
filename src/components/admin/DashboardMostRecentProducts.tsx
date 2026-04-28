import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Variation {
  price?: number;
  offer_price?: number;
  image_url?: string;
  images?: string[];
  in_stock?: boolean;
}

interface Product {
  id: string;
  name: string;
  product_variations?: Variation[];
}

interface Props {
  products: Product[];
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

function getImage(p: Product): string | null {
  for (const v of p.product_variations || []) {
    if (v.image_url) return v.image_url;
    if (v.images && v.images.length > 0) return v.images[0];
  }
  return null;
}

function getPrice(p: Product): number {
  const vars = p.product_variations || [];
  const prices = vars
    .map((v) => Number(v.offer_price && v.offer_price > 0 ? v.offer_price : v.price) || 0)
    .filter((n) => n > 0);
  return prices.length === 0 ? 0 : Math.min(...prices);
}

function isInStock(p: Product): boolean {
  return (p.product_variations || []).some((v) => v.in_stock);
}

/**
 * Lista compacta "Mais Recentes" para o sidebar do dashboard,
 * com thumbnail, preço e badge de estoque.
 */
export function DashboardMostRecentProducts({ products }: Props) {
  const navigate = useNavigate();
  const list = products.slice(0, 5);

  return (
    <Card className="border-border/40 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <h2 className="text-base font-bold text-foreground mb-3">Produtos Recentes</h2>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhum produto cadastrado.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((p) => {
              const img = getImage(p);
              const price = getPrice(p);
              const inStock = isInStock(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/produtos')}
                    className="w-full flex items-center gap-3 hover:bg-muted/50 -mx-2 px-2 py-1.5 rounded-lg transition-colors text-left"
                  >
                    <div className="shrink-0 w-11 h-11 rounded-xl bg-muted/50 overflow-hidden flex items-center justify-center">
                      {img ? (
                        <img src={img} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatBRL(price)}</p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                        inStock ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {inStock ? 'Em estoque' : 'Esgotado'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          variant="outline"
          className="w-full rounded-full mt-4 h-9 text-xs"
          onClick={() => navigate('/admin/produtos')}
        >
          Todos os produtos
        </Button>
      </CardContent>
    </Card>
  );
}