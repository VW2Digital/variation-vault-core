import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Star, Tag } from 'lucide-react';
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
  category?: string;
  product_variations?: Variation[];
}

interface Props {
  products: Product[];
  limit?: number;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

function getProductImage(p: Product): string | null {
  for (const v of p.product_variations || []) {
    if (v.image_url) return v.image_url;
    if (v.images && v.images.length > 0) return v.images[0];
  }
  return null;
}

function getProductPrice(p: Product): number {
  const vars = p.product_variations || [];
  const prices = vars
    .map((v) => Number(v.offer_price && v.offer_price > 0 ? v.offer_price : v.price) || 0)
    .filter((n) => n > 0);
  if (prices.length === 0) return 0;
  return Math.min(...prices);
}

/**
 * Grid de produtos no estilo do card "Products" da referência:
 * imagem grande, nome, preço, rating e categoria. Usa a paleta dourada
 * Liberty Pharma.
 */
export function DashboardProductsGrid({ products, limit = 4 }: Props) {
  const navigate = useNavigate();
  const list = products.slice(0, limit);

  return (
    <Card className="border-border/40 shadow-sm h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Package className="w-4 h-4" /> Produtos
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full text-[11px] px-3"
            onClick={() => navigate('/admin/produtos')}
          >
            Ver todos
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="text-center py-10">
            <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum produto cadastrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {list.map((p) => {
              const img = getProductImage(p);
              const price = getProductPrice(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/admin/produtos`)}
                  className="group text-left rounded-2xl border border-border/40 bg-card hover:border-primary/40 hover:shadow-md transition-all overflow-hidden"
                >
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-primary/5 via-muted/40 to-primary/10 overflow-hidden">
                    {img ? (
                      <img
                        src={img}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-10 h-10 text-primary/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-bold text-foreground truncate flex-1">{p.name}</p>
                      <p className="text-sm font-black text-foreground shrink-0">{formatBRL(price)}</p>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-primary text-primary" />
                        <span className="font-semibold text-foreground">5.0</span>
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <Tag className="w-3 h-3" />
                        <span className="truncate">{p.category || 'Sem categoria'}</span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}