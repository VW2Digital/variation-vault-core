import { useEffect, useState, useMemo } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, DollarSign, AlertTriangle, TrendingUp, CreditCard, QrCode, RefreshCw, ShoppingCart, CheckCircle2, XCircle, ArrowRightLeft, BarChart3, Tag, Clock, Eye, Undo2, Users, Wallet, Target, Pencil, Search } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
  import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
  import { useNavigate } from 'react-router-dom';
  import { Progress } from '@/components/ui/progress';
  import { Input } from '@/components/ui/input';
  import { Badge } from '@/components/ui/badge';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PeriodKey = '7' | '30' | '90';

interface RawOrder {
  status: string;
  payment_method: string;
  total_value: number;
  customer_email: string;
  product_name: string;
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
  '90': '3 meses',
};

const CONFIRMED_STATUSES = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];
const FAILED_STATUSES = ['REFUSED', 'OVERDUE'];

function filterByPeriod<T extends { created_at: string }>(items: T[], days: PeriodKey): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(days));
  return items.filter(i => new Date(i.created_at) >= cutoff);
}

function buildChartData(orders: RawOrder[], days: PeriodKey) {
  const now = new Date();
  const numDays = Number(days);
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

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(217 91% 60%)', 'hsl(142 71% 45%)', 'hsl(38 92% 50%)'];

const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const formatCompact = (v: number) => {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(0).replace('.', ',')}k`;
  return formatCurrency(v);
};

const Dashboard = () => {
  const [stats, setStats] = useState({ total: 0, variations: 0, outOfStock: 0 });
  const [allOrders, setAllOrders] = useState<RawOrder[]>([]);
  const [allLogs, setAllLogs] = useState<RawLog[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [paidWithoutLabel, setPaidWithoutLabel] = useState(0);
  const [totalClients, setTotalClients] = useState(0);
  const [stockSearch, setStockSearch] = useState('');
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
      setAllProducts(products);
      const { data: orders } = await supabase
        .from('orders')
        .select('status, payment_method, total_value, customer_email, product_name, created_at');
      setAllOrders((orders as RawOrder[]) || []);

      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['PAID', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
        .is('label_url', null);
      setPaidWithoutLabel(count || 0);

      const { count: profileCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      setTotalClients(profileCount || 0);

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

    const confirmedOrdersList = orders.filter(o => CONFIRMED_STATUSES.includes(o.status));
    const totalRevenue = confirmedOrdersList.reduce((sum, o) => sum + Number(o.total_value || 0), 0);
    const avgTicket = confirmedOrdersList.length > 0 ? totalRevenue / confirmedOrdersList.length : 0;

    const pixRevenue = confirmedOrdersList.filter(o => o.payment_method === 'pix').reduce((s, o) => s + Number(o.total_value || 0), 0);
    const cardRevenue = confirmedOrdersList.filter(o => o.payment_method === 'credit_card').reduce((s, o) => s + Number(o.total_value || 0), 0);

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
      pixOrders, cardOrders, pixConfirmed, cardConfirmed,
      pixRecoveries, totalRevenue, avgTicket, pixRevenue, cardRevenue,
      conversionRate, pixConversion, cardConversion,
    };
  }, [allOrders, allLogs, period]);

  const chartData = useMemo(() => buildChartData(filterByPeriod(allOrders, period), period), [allOrders, period]);

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

  // Stock monitoring: all variations with product info
  const allStockItems = useMemo(() => {
    const items: { name: string; dosage: string; stock: number; productId: string; price: number; category: string; image: string | null }[] = [];
    allProducts.forEach((p: any) => {
      (p.product_variations || []).forEach((v: any) => {
        items.push({
          name: p.name,
          dosage: v.dosage,
          stock: Number(v.stock_quantity || 0),
          productId: p.id,
          price: Number(v.is_offer && v.offer_price ? v.offer_price : v.price || 0),
          category: (p as any).category || '',
          image: v.image_url || (p.images && p.images[0]) || null,
        });
      });
    });
    return items.sort((a, b) => a.stock - b.stock);
  }, [allProducts]);

  const filteredStockItems = useMemo(() => {
    if (!stockSearch.trim()) return allStockItems;
    const q = stockSearch.toLowerCase();
    return allStockItems.filter(i => i.name.toLowerCase().includes(q));
  }, [allStockItems, stockSearch]);

  const lowStockItems = useMemo(() => allStockItems.slice(0, 5), [allStockItems]);

  // Revenue by category
  const revenueByCategoryData = useMemo(() => {
    const orders = filterByPeriod(allOrders, period);
    const catMap = new Map<string, number>();
    
    // Build product name -> category map
    const productCategoryMap = new Map<string, string>();
    allProducts.forEach((p: any) => {
      const cat = (p as any).category || 'Sem Categoria';
      productCategoryMap.set(p.name, cat);
    });

    orders.filter(o => CONFIRMED_STATUSES.includes(o.status)).forEach(o => {
      const cat = productCategoryMap.get(o.product_name) || 'Sem Categoria';
      catMap.set(cat, (catMap.get(cat) || 0) + Number(o.total_value || 0));
    });

    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allOrders, allProducts, period]);

  const statusBarData = useMemo(() => [
    { name: 'Confirmados', value: metrics.confirmedOrders, fill: 'hsl(142 71% 45%)' },
    { name: 'Pendentes', value: metrics.pendingOrders, fill: 'hsl(38 92% 50%)' },
    { name: 'Em Análise', value: metrics.inReview, fill: 'hsl(217 91% 60%)' },
    { name: 'Recusados', value: metrics.refused, fill: 'hsl(0 72% 51%)' },
    { name: 'Reembolsados', value: metrics.refunded, fill: 'hsl(220 9% 46%)' },
  ].filter(d => d.value > 0), [metrics]);

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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground uppercase">Dashboard</h1>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <TabsList className="bg-muted/50">
            {Object.entries(PERIOD_LABELS).map(([k, label]) => (
              <TabsTrigger key={k} value={k} className="text-xs sm:text-sm">{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs Grid 3x2 — estilo da referência */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Receita Total */}
        <Card className="border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receita Total</p>
              <DollarSign className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{formatCurrency(metrics.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1.5">{formatCurrency(metrics.totalRevenue)} no período</p>
          </CardContent>
        </Card>

        {/* Clientes */}
        <Card className="border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clientes</p>
              <Users className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{totalClients}</p>
            <p className="text-xs text-muted-foreground mt-1.5">Total cadastrados</p>
          </CardContent>
        </Card>

        {/* Pedidos no Período */}
        <Card className="border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedidos no Período</p>
              <ShoppingCart className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{metrics.totalOrders}</p>
            <p className="text-xs text-muted-foreground mt-1.5">{metrics.totalOrders} pedidos no total</p>
          </CardContent>
        </Card>

        {/* Ticket Médio */}
        <Card className="border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ticket Médio</p>
              <Wallet className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{formatCurrency(metrics.avgTicket)}</p>
            <p className="text-xs text-muted-foreground mt-1.5">Média por pedido pago</p>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card className="border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Taxa de Conversão</p>
              <Target className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{metrics.conversionRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1.5">Pedidos pagos / total</p>
          </CardContent>
        </Card>

        {/* Produtos Cadastrados */}
        <Card className="border-border/40 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produtos Cadastrados</p>
              <BarChart3 className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-1.5">Total no catálogo</p>
          </CardContent>
        </Card>
      </div>

      {/* Status dos Pedidos */}
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Status dos Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.totalOrders > 0 && (
            <div className="mb-4">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
                {statusBarData.map((d) => (
                  <div
                    key={d.name}
                    style={{ width: `${(d.value / metrics.totalOrders) * 100}%`, backgroundColor: d.fill }}
                    className="transition-all duration-500"
                    title={`${d.name}: ${d.value}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                {statusBarData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                    <span className="text-[11px] text-muted-foreground">{d.name}</span>
                    <span className="text-[11px] font-bold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-2">
            {[
              { label: 'Confirmados', value: metrics.confirmedOrders, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
              { label: 'Pendentes', value: metrics.pendingOrders, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { label: 'Em Análise', value: metrics.inReview, icon: Eye, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: 'Recusados', value: metrics.refused, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
              { label: 'Reembolsados', value: metrics.refunded, icon: Undo2, color: 'text-muted-foreground', bg: 'bg-muted' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 rounded-xl border border-border/40 p-3 bg-card">
                <div className={`p-1.5 rounded-lg ${item.bg}`}>
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{item.label}</p>
                  <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Evolução */}
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Evolução de Vendas & Receita
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={30} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => formatCompact(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', color: 'hsl(var(--foreground))', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number, name: string) => [
                    name === 'receita' ? formatCurrency(value) : value,
                    name === 'vendas' ? 'Pedidos' : 'Receita'
                  ]}
                />
                <Area yAxisId="left" type="monotone" dataKey="vendas" stroke="hsl(var(--primary))" fill="url(#colorVendas)" strokeWidth={2.5} name="vendas" />
                <Area yAxisId="right" type="monotone" dataKey="receita" stroke="hsl(142 71% 45%)" fill="url(#colorReceita)" strokeWidth={2.5} name="receita" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Métodos de Pagamento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribuição */}
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Distribuição por Método</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground text-center mb-1 uppercase tracking-wide">Pedidos</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={4} strokeWidth={0}>
                        {paymentPieData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => v} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground text-center mb-1 uppercase tracking-wide">Receita</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revenuePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={4} strokeWidth={0}>
                        {revenuePieData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Desempenho PIX vs Cartão */}
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Desempenho por Método</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* PIX */}
            <div className="rounded-xl border border-border/40 p-4 space-y-2.5 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-primary" />
                  <span className="font-bold text-sm text-foreground">PIX</span>
                </div>
                <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{metrics.pixConversion.toFixed(0)}% conversão</span>
              </div>
              <Progress value={metrics.pixConversion} className="h-1.5" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[9px] text-muted-foreground uppercase">Pedidos</p><p className="text-sm font-black text-foreground">{metrics.pixOrders}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Pagos</p><p className="text-sm font-black text-green-500">{metrics.pixConfirmed}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Receita</p><p className="text-sm font-black text-foreground">{formatCompact(metrics.pixRevenue)}</p></div>
              </div>
            </div>

            {/* Cartão */}
            <div className="rounded-xl border border-border/40 p-4 space-y-2.5 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  <span className="font-bold text-sm text-foreground">Cartão</span>
                </div>
                <span className="text-[11px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">{metrics.cardConversion.toFixed(0)}% conversão</span>
              </div>
              <Progress value={metrics.cardConversion} className="h-1.5" />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[9px] text-muted-foreground uppercase">Pedidos</p><p className="text-sm font-black text-foreground">{metrics.cardOrders}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Pagos</p><p className="text-sm font-black text-green-500">{metrics.cardConfirmed}</p></div>
                <div><p className="text-[9px] text-muted-foreground uppercase">Receita</p><p className="text-sm font-black text-foreground">{formatCompact(metrics.cardRevenue)}</p></div>
              </div>
            </div>

            {/* Recuperações via PIX */}
            <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-green-500" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Recuperações via PIX</p>
                    <p className="text-[9px] text-muted-foreground">Falha no cartão → pagou via PIX</p>
                  </div>
                </div>
                <span className="text-xl font-black text-green-500">{metrics.pixRecoveries}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Saúde do Estoque + Receita por Categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Saúde do Estoque */}
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Saúde do Estoque
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">Produtos com menor estoque</p>
          </CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma variação cadastrada</p>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((item, idx) => {
                  const maxStock = Math.max(...lowStockItems.map(i => i.stock), 1);
                  const pct = (item.stock / maxStock) * 100;
                  const barColor = item.stock <= 5 ? 'bg-destructive' : item.stock <= 20 ? 'bg-amber-500' : 'bg-primary';
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground truncate max-w-[60%]">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{item.stock} un.</span>
                          <button
                            onClick={() => navigate(`/admin/produtos/${item.productId}`)}
                            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Receita por Categoria */}
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receita por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByCategoryData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma venda no período</p>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByCategoryData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', color: 'hsl(var(--foreground))' }}
                      formatter={(v: number) => formatCurrency(v)}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerta de estoque */}
      {stats.outOfStock > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-foreground">
            <span className="font-bold">{stats.outOfStock} variação(ões)</span> sem estoque de um total de {stats.variations} variações.
          </p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
