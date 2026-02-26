import { useProducts } from '@/store';
import { Card, CardContent } from '@/components/ui/card';
import { Package, DollarSign, AlertTriangle } from 'lucide-react';

const Dashboard = () => {
  const { products } = useProducts();

  const totalProducts = products.length;
  const totalVariations = products.reduce((acc, p) => acc + p.variations.length, 0);
  const outOfStock = products.reduce(
    (acc, p) => acc + p.variations.filter((v) => !v.inStock).length,
    0
  );

  const stats = [
    { label: 'Produtos', value: totalProducts, icon: Package, color: 'text-primary' },
    { label: 'Variações', value: totalVariations, icon: DollarSign, color: 'text-accent' },
    { label: 'Sem Estoque', value: outOfStock, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
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
