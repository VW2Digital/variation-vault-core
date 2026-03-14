import { useEffect, useState, useMemo } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, DollarSign, AlertTriangle, TrendingUp, CreditCard, QrCode, RefreshCw, ShoppingCart, CheckCircle2, XCircle, ArrowRightLeft, BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type PeriodKey = '7' | '30' | '90' | 'all';

interface RawOrder {
  status: string;
  payment_method: string;
  total_value: number;
  customer_email: string;
  created_at: string;
}

interface RawLog {
  payment_method: string | null;
  customer_email: string | null;
  created_at: string;
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7': '7 dias',
  '30': '30 dias',
  '90': '90 dias',
  'all': 'Tudo',
};

function filterByPeriod<T extends { created_at: string }>(items: T[], days: PeriodKey): T[] {
  if (days === 'all') return items;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(days));
  return items.filter(i => new Date(i.created_at) >= cutoff);
}

function buildChartData(orders: RawOrder[], days: PeriodKey) {
  const confirmedStatuses = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];
  const now = new Date();
  const numDays = days === 'all' ? 90 : Number(days);
  const map = new Map<string, { vendas: number; receita: number }>();

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { vendas: 0, receita: 0 });
  }

  orders.forEach(o => {
    if (!confirmedStatuses.includes(o.status)) return;
    const key = new Date(o.created_at).toISOString().slice(0, 10);
    const entry = map.get(key);
    if (entry) {
      entry.vendas++;
      entry.receita += Number(o.total_value || 0);
    }
  });

  return Array.from(map.entries()).map(([date, data]) => ({
    date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
    ...data,
  }));
}

const Dashboard = () => {
  const [stats, setStats] = useState({ total: 0, variations: 0, outOfStock: 0 });
  const [allOrders, setAllOrders] = useState<RawOrder[]>([]);
  const [allLogs, setAllLogs] = useState<RawLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('30');

  useEffect(() => {
    const load = async () => {
      const products = await fetchProducts();
      const variations = products.reduce((acc: number, p: any) => acc + (p.product_variations?.length || 0), 0);
      const outOfStock = products.reduce(
        (acc: number, p: any) => acc + (p.product_variations?.filter((v: any) => !v.in_stock).length || 0),
        0
      );
      setStats({ total: products.length, variations, outOfStock });

      const { data: orders } = await supabase
        .from('orders')
        .select('status, payment_method, total_value, customer_email, created_at');
      setAllOrders((orders as RawOrder[]) || []);

      const { data: logs } = await supabase
        .from('payment_logs')
        .select('payment_method, customer_email, created_at');
      setAllLogs((logs as RawLog[]) || []);

      setLoading(false);
    };
    load();
  }, []);

  const metrics = useMemo(() => {
    const orders = filterByPeriod(allOrders, period);
    const logs = filterByPeriod(allLogs, period);

    const totalOrders = orders.length;
    const confirmed = orders.filter(o => ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'].includes(o.status)).length;
    const pending = orders.filter(o => o.status === 'PENDING').length;
    const pixOrders = orders.filter(o => o.payment_method === 'pix').length;
    const cardOrders = orders.filter(o => o.payment_method === 'credit_card').length;
    const totalRevenue = orders
      .filter(o => ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(o.status))
      .reduce((sum, o) => sum + Number(o.total_value || 0), 0);

    const failedPayments = logs.length;
    const pixFailures = logs.filter(l => l.payment_method === 'pix').length;
    const cardFailures = logs.filter(l => l.payment_method === 'credit_card').length;

    const cardFailEmails = new Set(
      logs.filter(l => l.payment_method === 'credit_card' && l.customer_email).map(l => l.customer_email!.toLowerCase())
    );
    const pixSuccessEmails = new Set(
      orders.filter(o => o.payment_method === 'pix' && ['CONFIRMED', 'RECEIVED', 'PENDING'].includes(o.status) && o.customer_email).map(o => o.customer_email.toLowerCase())
    );
    let pixRecoveries = 0;
    cardFailEmails.forEach(email => { if (pixSuccessEmails.has(email)) pixRecoveries++; });

    const conversionRate = totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0;

    return { totalOrders, confirmedOrders: confirmed, pendingOrders: pending, failedPayments, pixOrders, cardOrders, pixFailures, cardFailures, pixRecoveries, totalRevenue, conversionRate };
  }, [allOrders, allLogs, period]);

  const chartData = useMemo(() => {
    const orders = filterByPeriod(allOrders, period);
    return buildChartData(orders, period);
  }, [allOrders, period]);

  const productCards = [
    { label: 'Produtos', value: stats.total, icon: Package, color: 'text-primary' },
    { label: 'Variações', value: stats.variations, icon: DollarSign, color: 'text-accent' },
    { label: 'Sem Estoque', value: stats.outOfStock, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <TabsList>
            {Object.entries(PERIOD_LABELS).map(([k, label]) => (
              <TabsTrigger key={k} value={k}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Product Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {productCards.map((s) => (
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

      {/* Sales Chart */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Evolução de Vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => [
                      name === 'receita' ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : value,
                      name === 'vendas' ? 'Pedidos' : 'Receita'
                    ]}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="vendas" stroke="hsl(var(--primary))" fill="url(#colorVendas)" strokeWidth={2} />
                  <Area yAxisId="right" type="monotone" dataKey="receita" stroke="hsl(142 71% 45%)" fill="url(#colorReceita)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Metrics */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Métricas de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ShoppingCart className="w-4 h-4" />
                    <span className="text-xs">Total Pedidos</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{metrics.totalOrders}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs">Confirmados</span>
                  </div>
                  <p className="text-2xl font-bold text-green-500">{metrics.confirmedOrders}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span className="text-xs">Falhas</span>
                  </div>
                  <p className="text-2xl font-bold text-destructive">{metrics.failedPayments}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="text-xs">Taxa Conversão</span>
                  </div>
                  <p className="text-2xl font-bold text-primary">{metrics.conversionRate.toFixed(1)}%</p>
                </div>
              </div>

              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium text-foreground">Receita Confirmada</span>
                  </div>
                  <span className="text-xl font-bold text-primary">
                    R$ {metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-primary" />
                    <span className="font-medium text-sm text-foreground">PIX</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                      <p className="text-lg font-bold text-foreground">{metrics.pixOrders}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Falhas</p>
                      <p className="text-lg font-bold text-destructive">{metrics.pixFailures}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <span className="font-medium text-sm text-foreground">Cartão de Crédito</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                      <p className="text-lg font-bold text-foreground">{metrics.cardOrders}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Falhas</p>
                      <p className="text-lg font-bold text-destructive">{metrics.cardFailures}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-green-500" />
                    <div>
                      <span className="text-sm font-medium text-foreground">Recuperações via PIX</span>
                      <p className="text-xs text-muted-foreground">Clientes que falharam no cartão e pagaram via PIX</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-green-500">{metrics.pixRecoveries}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
