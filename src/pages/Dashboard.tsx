import { useEffect, useState, useMemo } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, DollarSign, AlertTriangle, TrendingUp, CreditCard, QrCode, RefreshCw, ShoppingCart, CheckCircle2, XCircle, ArrowRightLeft, BarChart3, Tag, Clock, Eye, Undo2, Users, Wallet, Target, Pencil, Search, Filter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
  import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
  import { useNavigate } from 'react-router-dom';
  import { Progress } from '@/components/ui/progress';
  import { Input } from '@/components/ui/input';
  import { Badge } from '@/components/ui/badge';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DashboardHero } from '@/components/admin/DashboardHero';
import { DashboardMonthlyGoal } from '@/components/admin/DashboardMonthlyGoal';
import { DashboardRecentOrders } from '@/components/admin/DashboardRecentOrders';
import { DashboardTopProducts } from '@/components/admin/DashboardTopProducts';
import { DashboardProductsGrid } from '@/components/admin/DashboardProductsGrid';
import { DashboardWelcomeHeader } from '@/components/admin/DashboardWelcomeHeader';
import { DashboardOverallSummary } from '@/components/admin/DashboardOverallSummary';
import { DashboardSalesOverview } from '@/components/admin/DashboardSalesOverview';
import { DashboardRecentActivity, type ActivityItem } from '@/components/admin/DashboardRecentActivity';
import { DashboardMostRecentProducts } from '@/components/admin/DashboardMostRecentProducts';

type PeriodKey = '7' | '30' | '90';

interface RawOrder {
  status: string;
  payment_method: string;
  total_value: number;
  customer_email: string;
  product_name: string;
  created_at: string;
  id?: string;
  customer_name?: string;
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
  const [cartUsers, setCartUsers] = useState(0);
  const [monthlyGoal, setMonthlyGoal] = useState<number>(0);
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
        .select('id, status, payment_method, total_value, customer_email, customer_name, product_name, created_at')
        .order('created_at', { ascending: false });
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

      const { data: cartData } = await supabase
        .from('cart_items')
        .select('user_id');
      const uniqueCartUsers = new Set((cartData || []).map((c: any) => c.user_id));
      setCartUsers(uniqueCartUsers.size);

      const { data: logs } = await supabase
        .from('payment_logs')
        .select('payment_method, customer_email, created_at');
      setAllLogs((logs as RawLog[]) || []);

      const { data: goalSetting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'monthly_revenue_goal')
        .maybeSingle();
      const parsed = Number((goalSetting as any)?.value);
      setMonthlyGoal(Number.isFinite(parsed) ? parsed : 0);

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

  // Receita do período anterior equivalente (variação % do hero)
  const previousPeriodRevenue = useMemo(() => {
    const days = Number(period);
    const cutoffEnd = new Date();
    cutoffEnd.setDate(cutoffEnd.getDate() - days);
    const cutoffStart = new Date(cutoffEnd);
    cutoffStart.setDate(cutoffStart.getDate() - days);
    return allOrders
      .filter((o) => {
        const d = new Date(o.created_at);
        return d >= cutoffStart && d < cutoffEnd && CONFIRMED_STATUSES.includes(o.status);
      })
      .reduce((s, o) => s + Number(o.total_value || 0), 0);
  }, [allOrders, period]);

  // Receita do mês corrente vs mês anterior (card de meta)
  const monthRevenues = useMemo(() => {
    const now = new Date();
    const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrev = new Date(now.getFullYear(), now.getMonth(), 1);
    let current = 0;
    let prev = 0;
    allOrders.forEach((o) => {
      if (!CONFIRMED_STATUSES.includes(o.status)) return;
      const d = new Date(o.created_at);
      const v = Number(o.total_value || 0);
      if (d >= startCurrent) current += v;
      else if (d >= startPrev && d < endPrev) prev += v;
    });
    return { current, prev };
  }, [allOrders]);

  // Top produtos por receita no período
  const topProducts = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    filterByPeriod(allOrders, period)
      .filter((o) => CONFIRMED_STATUSES.includes(o.status))
      .forEach((o) => {
        const key = o.product_name || '—';
        const cur = map.get(key) || { qty: 0, revenue: 0 };
        cur.qty += 1;
        cur.revenue += Number(o.total_value || 0);
        map.set(key, cur);
      });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [allOrders, period]);

  // Pedidos mais recentes (qualquer status) para o painel lateral
  const recentOrders = useMemo(() => {
    return allOrders.slice(0, 6).map((o) => ({
      id: o.id || `${o.created_at}-${o.customer_email}`,
      customer_name: o.customer_name || (o.customer_email || 'Cliente').split('@')[0],
      product_name: o.product_name || '—',
      total_value: Number(o.total_value || 0),
      payment_method: o.payment_method || 'pix',
      status: o.status,
      created_at: o.created_at,
    }));
  }, [allOrders]);

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

  const funnelData = useMemo(() => {
    const uniqueOrderUsers = new Set(filterByPeriod(allOrders, period).map(o => o.customer_email?.toLowerCase())).size;
    const checkoutStarted = filterByPeriod(allOrders, period).length;
    const purchased = filterByPeriod(allOrders, period).filter(o => CONFIRMED_STATUSES.includes(o.status)).length;

    const stages = [
      { label: 'Clientes Cadastrados', value: totalClients, icon: Users, color: 'hsl(217 91% 60%)' },
      { label: 'Adicionaram ao Carrinho', value: cartUsers + uniqueOrderUsers, icon: ShoppingCart, color: 'hsl(38 92% 50%)' },
      { label: 'Iniciaram Checkout', value: checkoutStarted, icon: CreditCard, color: 'hsl(var(--primary))' },
      { label: 'Compraram', value: purchased, icon: CheckCircle2, color: 'hsl(142 71% 45%)' },
    ];

    const maxValue = Math.max(...stages.map(s => s.value), 1);
    return stages.map((s, i) => ({
      ...s,
      pct: (s.value / maxValue) * 100,
      conversionFromPrev: i > 0 && stages[i - 1].value > 0
        ? ((s.value / stages[i - 1].value) * 100).toFixed(1)
        : null,
    }));
  }, [totalClients, cartUsers, allOrders, period]);

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

      {/* Hero Receita + Meta do Mês (estilo referência) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DashboardHero
            currentRevenue={metrics.totalRevenue}
            previousRevenue={previousPeriodRevenue}
            periodLabel={PERIOD_LABELS[period]}
            subline={`Atualizado em tempo real • Últimos ${PERIOD_LABELS[period]}`}
          />
        </div>
        <DashboardMonthlyGoal
          currentMonthRevenue={monthRevenues.current}
          previousMonthRevenue={monthRevenues.prev}
          monthlyGoal={monthlyGoal}
        />
      </div>

      {/* Top produtos + Pedidos recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DashboardProductsGrid products={allProducts as any} limit={4} />
        </div>
        <DashboardRecentOrders orders={recentOrders} />
      </div>

      {/* Ranking de top produtos por receita */}
      <DashboardTopProducts products={topProducts} />

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

      {/* Funil de Conversão */}
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Funil de Conversão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnelData.map((stage, idx) => (
              <div key={stage.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <stage.icon className="w-4 h-4" style={{ color: stage.color }} />
                    <span className="text-xs font-semibold text-foreground">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-foreground">{stage.value}</span>
                    {stage.conversionFromPrev && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border" style={{ color: stage.color, borderColor: stage.color }}>
                        {stage.conversionFromPrev}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(stage.pct, 2)}%`, backgroundColor: stage.color, opacity: 0.85 }}
                  />
                </div>
                {idx < funnelData.length - 1 && (
                  <div className="flex justify-center my-1">
                    <div className="w-px h-3 bg-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
          {funnelData.length >= 4 && funnelData[0].value > 0 && (
            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Taxa geral (Cadastro → Compra)</span>
              <span className="text-sm font-black text-foreground">
                {((funnelData[3].value / funnelData[0].value) * 100).toFixed(1)}%
              </span>
            </div>
          )}
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

      {/* Monitoramento de Estoque */}
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Package className="w-4 h-4" />
                Monitoramento de Estoque
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">{allStockItems.length} produto(s) cadastrado(s)</p>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {filteredStockItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum produto encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Produto</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Categoria</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Preço</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold">Estoque</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-center">Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStockItems.map((item, idx) => {
                    const maxStock = Math.max(...allStockItems.map(i => i.stock), 100);
                    const pct = Math.min((item.stock / maxStock) * 100, 100);
                    const isCritical = item.stock <= 10;
                    const isLow = item.stock <= 30;
                    return (
                      <TableRow key={idx} className="group">
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-border/40" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-foreground">{item.name}</p>
                              {item.dosage && <p className="text-[10px] text-muted-foreground">{item.dosage}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.category ? (
                            <Badge variant="secondary" className="text-[10px] font-medium">{item.category}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
                          {formatCurrency(item.price)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-[160px]">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isCritical ? 'bg-destructive' : isLow ? 'bg-amber-500' : 'bg-primary'
                                }`}
                                style={{ width: `${Math.max(pct, 3)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-foreground whitespace-nowrap">{item.stock} unid.</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {isCritical ? (
                            <Badge variant="destructive" className="text-[10px] font-bold uppercase">Crítico</Badge>
                          ) : isLow ? (
                            <Badge className="text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">Baixo</Badge>
                          ) : (
                            <Badge className="text-[10px] font-bold uppercase bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">Ativo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/admin/produtos/${item.productId}`)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-50 group-hover:opacity-100"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
