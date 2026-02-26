import { useEffect, useState } from 'react';
import { fetchProducts } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Package, DollarSign, AlertTriangle } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState({ total: 0, variations: 0, outOfStock: 0 });

  useEffect(() => {
    fetchProducts().then((products) => {
      const variations = products.reduce((acc: number, p: any) => acc + (p.product_variations?.length || 0), 0);
      const outOfStock = products.reduce(
        (acc: number, p: any) => acc + (p.product_variations?.filter((v: any) => !v.in_stock).length || 0),
        0
      );
      setStats({ total: products.length, variations, outOfStock });
    });
  }, []);

  const cards = [
    { label: 'Produtos', value: stats.total, icon: Package, color: 'text-primary' },
    { label: 'Variações', value: stats.variations, icon: DollarSign, color: 'text-accent' },
    { label: 'Sem Estoque', value: stats.outOfStock, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className={`p-3 rounded-lg bg-muted ${s.color}`}>
                <s.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
