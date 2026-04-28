import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Package } from 'lucide-react';

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface Props {
  products: TopProduct[];
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Ranking dos produtos mais vendidos no período. Inspirado no card
 * "Monetary Transaction" da referência (barra horizontal com %).
 */
export function DashboardTopProducts({ products }: Props) {
  const max = Math.max(...products.map((p) => p.revenue), 1);

  return (
    <Card className="border-border/40 shadow-sm h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Top Produtos
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">Por receita no período</span>
        </div>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-10">
            <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Sem vendas no período selecionado.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {products.slice(0, 5).map((p, i) => {
              const pct = (p.revenue / max) * 100;
              return (
                <li key={p.name + i} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">{formatBRL(p.revenue)}</p>
                      <p className="text-[10px] text-muted-foreground">{p.qty} pedidos</p>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-700"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
