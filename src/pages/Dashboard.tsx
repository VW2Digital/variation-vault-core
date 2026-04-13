import { useEffect, useState, useMemo } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, DollarSign, AlertTriangle, TrendingUp, CreditCard, QrCode, RefreshCw, ShoppingCart, CheckCircle2, XCircle, ArrowRightLeft, BarChart3, Tag, Clock, Eye, Undo2, Percent } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';

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

const CONFIRMED_STATUSES = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];
const FAILED_STATUSES = ['REFUSED', 'OVERDUE'];

function filterByPeriod<T extends { created_at: string }>(items: T[], days: PeriodKey): T[] {
  if (days === 'all') return items;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(days));
  return items.filter(i => new Date(i.created_at) >= cutoff);
}

function buildChartData(orders: RawOrder[], days: PeriodKey) {
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
    if (!CONFIRMED_STATUSES.includes(o.status)) return;
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

function buildStatusBarData(metrics: any) {
  return [
    { name: 'Confirmados', value: metrics.confirmedOrders, fill: 'hsl(142 71% 45%)' },
    { name: 'Pendentes', value: metrics.pendingOrders, fill: 'hsl(38 92% 50%)' },
    { name: 'Em Análise', value: metrics.inReview, fill: 'hsl(217 91% 60%)' },
    { name: 'Recusados', value: metrics.refused, fill: 'hsl(0 72% 51%)' },
    { name: 'Reembolsados', value: metrics.refunded, fill: 'hsl(220 9% 46%)' },
  ].filter(d => d.value > 0);
}

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(217 91% 60%)', 'hsl(142 71% 45%)', 'hsl(38 92% 50%)'];

const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

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

    const totalOrders = orders.length;
    const confirmed = orders.filter(o => CONFIRMED_STATUSES.includes(o.status)).length;
    const refused = orders.filter(o => FAILED_STATUSES.includes(o.status)).length;
    const pending = orders.filter(o => o.status === 'PENDING').length;
    const inReview = orders.filter(o => o.status === 'IN_REVIEW').length;
    const refunded = orders.filter(o => o.status === 'REFUNDED').length;

    const pixOrders = orders.filter(o => o.payment_method === 'pix').length;
    const cardOrders = orders.filter(o => o.payment_method === 'credit_card').length;
    const pixConfirmed = orders.filter(o => o.payment_method === 'pix' && CONFIRMED_STATUSES.includes(o.status)).length;
    const cardConfirmed = orders.filter(o => o.payment_method === 'credit_card' && CONFIRMED_STATUSES.includes(o.status)).length;
    const pixRefused = orders.filter(o => o.payment_method === 'pix' && FAILED_STATUSES.includes(o.status)).length;
    const cardRefused = orders.filter(o => o.payment_method === 'credit_card' && FAILED_STATUSES.includes(o.status)).length;

    const confirmedOrders = orders.filter(o => CONFIRMED_STATUSES.includes(o.status));
    const totalRevenue = confirmedOrders.reduce((sum, o) => sum + Number(o.total_value || 0), 0);
    const avgTicket = confirmedOrders.length > 0 ? totalRevenue / confirmedOrders.length : 0;

    const pixRevenue = confirmedOrders.filter(o => o.payment_method === 'pix').reduce((s, o) => s + Number(o.total_value || 0), 0);
    const cardRevenue = confirmedOrders.filter(o => o.payment_method === 'credit_card').reduce((s, o) => s + Number(o.total_value || 0), 0);

    const paymentErrors = logs.length;

    // Recuperações via PIX
    const cardFailEmails = new Set([
      ...orders.filter(o => o.payment_method === 'credit_card' && FAILED_STATUSES.includes(o.status) && o.customer_email).map(o => o.customer_email.toLowerCase()),
      ...logs.filter(l => l.payment_method === 'credit_card' && l.customer_email).map(l => l.customer_email!.toLowerCase()),
    ]);
    const pixSuccessEmails = new Set(
      orders.filter(o => o.payment_method === 'pix' && CONFIRMED_STATUSES.includes(o.status) && o.customer_email).map(o => o.customer_email.toLowerCase())
    );
    let pixRecoveries = 0;
    cardFailEmails.forEach(email => { if (pixSuccessEmails.has(email)) pixRecoveries++; });

    const conversionRate = totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0;
    const pixConversion = pixOrders > 0 ? (pixConfirmed / pixOrders) * 100 : 0;
    const cardConversion = cardOrders > 0 ? (cardConfirmed / cardOrders) * 100 : 0;

    return {
      totalOrders, confirmedOrders: confirmed, refused, pendingOrders: pending, inReview, refunded,
      paymentErrors, pixOrders, cardOrders, pixConfirmed, cardConfirmed, pixRefused, cardRefused,
      pixRecoveries, totalRevenue, avgTicket, pixRevenue, cardRevenue,
      conversionRate, pixConversion, cardConversion,
    };
  }, [allOrders, allLogs, period]);

  const chartData = useMemo(() => {
    const orders = filterByPeriod(allOrders, period);
    return buildChartData(orders, period);
  }, [allOrders, period]);

  const statusBarData = useMemo(() => buildStatusBarData(metrics), [metrics]);

  const paymentPieData = useMemo(() => {
    const data = [];
    if (metrics.pixOrders > 0) data.push({ name: 'PIX', value: metrics.pixOrders });
    if (metrics.cardOrders > 0) data.push({ name: 'Cartão', value: metrics.cardOrders });
    const other = metrics.totalOrders - metrics.pixOrders - metrics.cardOrders;
    if (other > 0) data.push({ name: 'Outros', value: other });
    return data;
  }, [metrics]);

  const revenuePieData = useMemo(() => {
    const data = [];
    if (metrics.pixRevenue > 0) data.push({ name: 'PIX', value: metrics.pixRevenue });
    if (metrics.cardRevenue > 0) data.push({ name: 'Cartão', value: metrics.cardRevenue });
    const other = metrics.totalRevenue - metrics.pixRevenue - metrics.cardRevenue;
    if (other > 0) data.push({ name: 'Outros', value: other });
    return data;
  }, [metrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert de etiquetas */}
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

      {/* Header com filtro de período */}
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

      {/* KPIs Principais - 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Receita Confirmada</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatCurrency(metrics.totalRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: 'hsl(142 71% 45%)' }} />
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-green-500/10">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Pedidos Confirmados</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">{metrics.confirmedOrders} <span className="text-sm font-normal text-muted-foreground">/ {metrics.totalOrders}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: 'hsl(217 91% 60%)' }} />
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <Percent className="w-5 h-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Taxa de Conversão</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">{metrics.conversionRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-accent" />
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/10">
                <ShoppingCart className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">Ticket Médio</p>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatCurrency(metrics.avgTicket)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status dos Pedidos - Barra horizontal */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Status dos Pedidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Status visual bar */}
          {metrics.totalOrders > 0 && (
            <div className="mb-4">
              <div className="flex h-3 rounded-full overflow-hidden">
                {statusBarData.map((d) => (
                  <div
                    key={d.name}
                    style={{ width: `${(d.value / metrics.totalOrders) * 100}%`, backgroundColor: d.fill }}
                    className="transition-all duration-500"
                    title={`${d.name}: ${d.value}`}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Confirmados', value: metrics.confirmedOrders, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
              { label: 'Pendentes', value: metrics.pendingOrders, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { label: 'Em Análise', value: metrics.inReview, icon: Eye, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: 'Recusados', value: metrics.refused, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
              { label: 'Reembolsados', value: metrics.refunded, icon: Undo2, color: 'text-muted-foreground', bg: 'bg-muted' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg border border-border/50 p-3">
                <div className={`p-1.5 rounded-lg ${item.bg}`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Evolução */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Evolução de Vendas & Receita
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                    name === 'receita' ? formatCurrency(value) : value,
                    name === 'vendas' ? 'Pedidos' : 'Receita'
                  ]}
                />
                <Area yAxisId="left" type="monotone" dataKey="vendas" stroke="hsl(var(--primary))" fill="url(#colorVendas)" strokeWidth={2} name="vendas" />
                <Area yAxisId="right" type="monotone" dataKey="receita" stroke="hsl(142 71% 45%)" fill="url(#colorReceita)" strokeWidth={2} name="receita" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Métodos de Pagamento - PIX vs Cartão */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico de pizza - distribuição por método */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Distribuição por Método
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground text-center mb-1">Pedidos</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                        {paymentPieData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => v} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground text-center mb-1">Receita</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revenuePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                        {revenuePieData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detalhes PIX vs Cartão */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Desempenho por Método
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* PIX */}
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-sm text-foreground">PIX</span>
                </div>
                <span className="text-xs font-medium text-primary">{metrics.pixConversion.toFixed(0)}% conversão</span>
              </div>
              <Progress value={metrics.pixConversion} className="h-2" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Pedidos</p>
                  <p className="text-sm font-bold text-foreground">{metrics.pixOrders}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Confirmados</p>
                  <p className="text-sm font-bold text-green-500">{metrics.pixConfirmed}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Receita</p>
                  <p className="text-sm font-bold text-foreground">{formatCurrency(metrics.pixRevenue)}</p>
                </div>
              </div>
            </div>

            {/* Cartão */}
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-500" />
                  <span className="font-semibold text-sm text-foreground">Cartão</span>
                </div>
                <span className="text-xs font-medium text-blue-500">{metrics.cardConversion.toFixed(0)}% conversão</span>
              </div>
              <Progress value={metrics.cardConversion} className="h-2" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Pedidos</p>
                  <p className="text-sm font-bold text-foreground">{metrics.cardOrders}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Confirmados</p>
                  <p className="text-sm font-bold text-green-500">{metrics.cardConfirmed}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Receita</p>
                  <p className="text-sm font-bold text-foreground">{formatCurrency(metrics.cardRevenue)}</p>
                </div>
              </div>
            </div>

            {/* Recuperações via PIX */}
            <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Recuperações via PIX</p>
                    <p className="text-[10px] text-muted-foreground">Falha no cartão → pagou via PIX</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-green-500">{metrics.pixRecoveries}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Produto Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Produtos', value: stats.total, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Variações', value: stats.variations, icon: DollarSign, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Sem Estoque', value: stats.outOfStock, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-xl ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
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
