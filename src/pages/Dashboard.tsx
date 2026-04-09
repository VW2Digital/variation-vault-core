import { useEffect, useState, useMemo } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, DollarSign, AlertTriangle, TrendingUp, CreditCard, QrCode, RefreshCw, ShoppingCart, CheckCircle2, XCircle, ArrowRightLeft, BarChart3, Tag } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useNavigate } from 'react-router-dom';

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
  const [paidWithoutLabel, setPaidWithoutLabel] = useState(0);
  const navigate = useNavigate();

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

      // Count paid orders without shipping label
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['PAID', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
        .is('label_url', null);
      setPaidWithoutLabel(count || 0);

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

    const confirmedStatuses = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];
    const failedStatuses = ['REFUSED', 'OVERDUE'];

    const totalOrders = orders.length;
    const confirmed = orders.filter(o => confirmedStatuses.includes(o.status)).length;
    const refused = orders.filter(o => failedStatuses.includes(o.status)).length;
    const pending = orders.filter(o => o.status === 'PENDING').length;
    const inReview = orders.filter(o => o.status === 'IN_REVIEW').length;
    const refunded = orders.filter(o => o.status === 'REFUNDED').length;

    const pixOrders = orders.filter(o => o.payment_method === 'pix').length;
    const cardOrders = orders.filter(o => o.payment_method === 'credit_card').length;
    const pixRefused = orders.filter(o => o.payment_method === 'pix' && failedStatuses.includes(o.status)).length;
    const cardRefused = orders.filter(o => o.payment_method === 'credit_card' && failedStatuses.includes(o.status)).length;

    const totalRevenue = orders
      .filter(o => confirmedStatuses.includes(o.status))
      .reduce((sum, o) => sum + Number(o.total_value || 0), 0);

    const paymentErrors = logs.length;

    // Recuperações via PIX: clientes que tiveram falha no cartão (REFUSED ou log de erro) e depois pagaram via PIX
    const cardFailEmails = new Set([
      ...orders.filter(o => o.payment_method === 'credit_card' && failedStatuses.includes(o.status) && o.customer_email).map(o => o.customer_email.toLowerCase()),
      ...logs.filter(l => l.payment_method === 'credit_card' && l.customer_email).map(l => l.customer_email!.toLowerCase()),
    ]);
    const pixSuccessEmails = new Set(
      orders.filter(o => o.payment_method === 'pix' && confirmedStatuses.includes(o.status) && o.customer_email).map(o => o.customer_email.toLowerCase())
    );
    let pixRecoveries = 0;
    cardFailEmails.forEach(email => { if (pixSuccessEmails.has(email)) pixRecoveries++; });

    const conversionRate = totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0;

    return { totalOrders, confirmedOrders: confirmed, refused, pendingOrders: pending, inReview, refunded, paymentErrors, pixOrders, cardOrders, pixRefused, cardRefused, pixRecoveries, totalRevenue, conversionRate };
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
      {paidWithoutLabel > 0 && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 cursor-pointer" onClick={() => navigate('/admin/pedidos')}>
          <Tag className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-semibold">Etiquetas pendentes</AlertTitle>
          <AlertDescription>
            {paidWithoutLabel === 1
              ? 'Há 1 pedido pago aguardando geração de etiqueta de envio.'
              : `Há ${paidWithoutLabel} pedidos pagos aguardando geração de etiqueta de envio.`}
          </AlertDescription>
        </Alert>
      )}

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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ShoppingCart className="w-4 h-4" />
                    <span className="text-xs">Total Pedidos</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-foreground">{metrics.totalOrders}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs">Confirmados</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-green-500">{metrics.confirmedOrders}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span className="text-xs">Recusados</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-destructive">{metrics.refused}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="text-xs">Taxa Conversão</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-primary">{metrics.conversionRate.toFixed(1)}%</p>
                </div>
              </div>

              {(metrics.inReview > 0 || metrics.pendingOrders > 0 || metrics.refunded > 0) && (
                <div className="grid grid-cols-3 gap-3">
                  {metrics.pendingOrders > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Pendentes</span>
                      <p className="text-lg font-bold text-amber-500">{metrics.pendingOrders}</p>
                    </div>
                  )}
                  {metrics.inReview > 0 && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Em Análise</span>
                      <p className="text-lg font-bold text-blue-500">{metrics.inReview}</p>
                    </div>
                  )}
                  {metrics.refunded > 0 && (
                    <div className="rounded-lg border border-muted-foreground/30 bg-muted/30 p-3 space-y-1">
                      <span className="text-xs text-muted-foreground">Reembolsados</span>
                      <p className="text-lg font-bold text-muted-foreground">{metrics.refunded}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium text-foreground">Receita Confirmada</span>
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-primary">
                    R$ {metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <p className="text-xs text-muted-foreground">Recusados</p>
                      <p className="text-lg font-bold text-destructive">{metrics.pixRefused}</p>
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
                      <p className="text-xs text-muted-foreground">Recusados</p>
                      <p className="text-lg font-bold text-destructive">{metrics.cardRefused}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-green-500" />
                    <div>
                      <span className="text-sm font-medium text-foreground">Recuperações via PIX</span>
                      <p className="text-xs text-muted-foreground">Clientes que falharam no cartão e pagaram via PIX</p>
                    </div>
                  </div>
                  <span className="text-lg sm:text-xl font-bold text-green-500">{metrics.pixRecoveries}</span>
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
