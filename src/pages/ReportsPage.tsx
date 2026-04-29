import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RefreshCw, X, Calendar, TrendingUp, TrendingDown, Minus, FileBarChart } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

interface RawOrder {
  status: string;
  payment_method: string;
  total_value: number;
  shipping_cost: number | null;
  coupon_discount: number | null;
  product_name: string;
  created_at: string;
}

const CONFIRMED = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];
const FAILED = ['REFUSED', 'OVERDUE'];
const DONUT_COLORS = ['hsl(38 92% 50%)', 'hsl(174 60% 40%)', 'hsl(0 60% 50%)', 'hsl(217 91% 60%)', 'hsl(220 9% 46%)'];

const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const fmt = (d: Date) => d.toISOString().slice(0, 10);

const subDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() - n); return r; };

type Grouping = 'day' | 'week' | 'month';

function groupKey(dateStr: string, grouping: Grouping): string {
  const d = new Date(dateStr);
  if (grouping === 'day') return fmt(d);
  if (grouping === 'week') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return fmt(monday);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatLabel(key: string, grouping: Grouping): string {
  if (grouping === 'month') {
    const [y, m] = key.split('-');
    return `${m}/${y}`;
  }
  const [, m, day] = key.split('-');
  return `${day}/${m}`;
}

const ReportsPage = () => {
  const [allOrders, setAllOrders] = useState<RawOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => new Date(), []);

  const [startDate, setStartDate] = useState(fmt(subDays(today, 30)));
  const [endDate, setEndDate] = useState(fmt(today));
  const [grouping, setGrouping] = useState<Grouping>('day');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('orders')
        .select('status, payment_method, total_value, shipping_cost, coupon_discount, product_name, created_at');
      setAllOrders((data as RawOrder[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const setQuickPeriod = (days: number) => {
    setStartDate(fmt(subDays(today, days)));
    setEndDate(fmt(today));
  };

  const clearFilters = () => {
    setStartDate(fmt(subDays(today, 30)));
    setEndDate(fmt(today));
    setGrouping('day');
  };

  const filtered = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    return allOrders.filter(o => {
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    });
  }, [allOrders, startDate, endDate]);

  const metrics = useMemo(() => {
    const confirmed = filtered.filter(o => CONFIRMED.includes(o.status));
    const revenue = confirmed.reduce((s, o) => s + Number(o.total_value || 0), 0);
    const orders = confirmed.length;
    const avgTicket = orders > 0 ? revenue / orders : 0;
    const shippingTotal = confirmed.reduce((s, o) => s + Number(o.shipping_cost || 0), 0);
    const discountTotal = confirmed.reduce((s, o) => s + Number(o.coupon_discount || 0), 0);
    const conversion = filtered.length > 0 ? (orders / filtered.length) * 100 : 0;
    return { revenue, orders, avgTicket, shippingTotal, discountTotal, conversion };
  }, [filtered]);

  // Previous period (same duration, shifted back)
  const prevFiltered = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration - 86400000);
    const prevEnd = new Date(start.getTime() - 86400000);
    return allOrders.filter(o => {
      const d = new Date(o.created_at);
      return d >= prevStart && d <= prevEnd;
    });
  }, [allOrders, startDate, endDate]);

  const prevMetrics = useMemo(() => {
    const confirmed = prevFiltered.filter(o => CONFIRMED.includes(o.status));
    const revenue = confirmed.reduce((s, o) => s + Number(o.total_value || 0), 0);
    const orders = confirmed.length;
    const avgTicket = orders > 0 ? revenue / orders : 0;
    const shippingTotal = confirmed.reduce((s, o) => s + Number(o.shipping_cost || 0), 0);
    const discountTotal = confirmed.reduce((s, o) => s + Number(o.coupon_discount || 0), 0);
    const conversion = prevFiltered.length > 0 ? (orders / prevFiltered.length) * 100 : 0;
    return { revenue, orders, avgTicket, shippingTotal, discountTotal, conversion };
  }, [prevFiltered]);


  // Revenue chart data
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    if (grouping === 'day') {
      const cur = new Date(start);
      while (cur <= end) { map.set(fmt(cur), 0); cur.setDate(cur.getDate() + 1); }
    }
    filtered.filter(o => CONFIRMED.includes(o.status)).forEach(o => {
      const key = groupKey(o.created_at, grouping);
      map.set(key, (map.get(key) || 0) + Number(o.total_value || 0));
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ label: formatLabel(key, grouping), value }));
  }, [filtered, grouping, startDate, endDate]);

  // Orders per period (bar chart)
  const ordersPerPeriod = useMemo(() => {
    const map = new Map<string, number>();
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    if (grouping === 'day') {
      const cur = new Date(start);
      while (cur <= end) { map.set(fmt(cur), 0); cur.setDate(cur.getDate() + 1); }
    }
    filtered.forEach(o => {
      const key = groupKey(o.created_at, grouping);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ label: formatLabel(key, grouping), value }));
  }, [filtered, grouping, startDate, endDate]);

  // Avg ticket per period (line chart)
  const ticketPerPeriod = useMemo(() => {
    const countMap = new Map<string, number>();
    const sumMap = new Map<string, number>();
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    if (grouping === 'day') {
      const cur = new Date(start);
      while (cur <= end) { const k = fmt(cur); countMap.set(k, 0); sumMap.set(k, 0); cur.setDate(cur.getDate() + 1); }
    }
    filtered.filter(o => CONFIRMED.includes(o.status)).forEach(o => {
      const key = groupKey(o.created_at, grouping);
      countMap.set(key, (countMap.get(key) || 0) + 1);
      sumMap.set(key, (sumMap.get(key) || 0) + Number(o.total_value || 0));
    });
    return Array.from(countMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ label: formatLabel(key, grouping), value: count > 0 ? (sumMap.get(key) || 0) / count : 0 }));
  }, [filtered, grouping, startDate, endDate]);

  // Payment status (donut) — engloba status de pedido (Pago/Pendente/Falhou/Reembolsado)
  const paymentStatus = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(o => {
      let label = 'Outro';
      if (CONFIRMED.includes(o.status)) label = 'Pago';
      else if (o.status === 'PENDING') label = 'Pendente';
      else if (FAILED.includes(o.status)) label = 'Falhou';
      else if (o.status === 'REFUNDED') label = 'Reembolsado';
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Revenue by method (donut)
  const revenueByMethod = useMemo(() => {
    const map = new Map<string, number>();
    filtered.filter(o => CONFIRMED.includes(o.status)).forEach(o => {
      const method = o.payment_method === 'pix' ? 'PIX' : o.payment_method === 'credit_card' ? 'Cartão' : o.payment_method || 'Outro';
      map.set(method, (map.get(method) || 0) + Number(o.total_value || 0));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Top 10 products (agrega por nome normalizado para evitar duplicatas)
  const topProducts = useMemo(() => {
    const map = new Map<string, number>();
    filtered.filter(o => CONFIRMED.includes(o.status)).forEach(o => {
      const name = (o.product_name || 'Sem nome').trim().replace(/\s+/g, ' ');
      map.set(name, (map.get(name) || 0) + Number(o.total_value || 0));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  const exportCSV = () => {
    const confirmed = filtered.filter(o => CONFIRMED.includes(o.status));
    const header = 'Data,Status,Método,Valor,Frete,Desconto\n';
    const rows = confirmed.map(o =>
      `${new Date(o.created_at).toLocaleDateString('pt-BR')},${o.status},${o.payment_method},${Number(o.total_value || 0).toFixed(2)},${Number(o.shipping_cost || 0).toFixed(2)},${Number(o.coupon_discount || 0).toFixed(2)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pctChange = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  };

  const kpis = [
    { label: 'Receita', value: formatCurrency(metrics.revenue), change: pctChange(metrics.revenue, prevMetrics.revenue) },
    { label: 'Pedidos', value: String(metrics.orders), change: pctChange(metrics.orders, prevMetrics.orders) },
    { label: 'Ticket Médio', value: formatCurrency(metrics.avgTicket), change: pctChange(metrics.avgTicket, prevMetrics.avgTicket) },
    { label: 'Descontos', value: formatCurrency(metrics.discountTotal), change: pctChange(metrics.discountTotal, prevMetrics.discountTotal) },
    { label: 'Conversão', value: `${metrics.conversion.toFixed(1)}%`, change: pctChange(metrics.conversion, prevMetrics.conversion) },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Relatórios"
        description="KPIs financeiros, conversão e variação por período."
        icon={FileBarChart}
        actions={
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        }
      />

      {/* Filters */}
      <Card className="border-border/40 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data início</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="pl-9 h-9 text-sm w-full sm:w-40"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data fim</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="pl-9 h-9 text-sm w-full sm:w-40"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Agrupar por</label>
                <Select value={grouping} onValueChange={(v) => setGrouping(v as Grouping)}>
                  <SelectTrigger className="h-9 text-sm w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Dia</SelectItem>
                    <SelectItem value="week">Semana</SelectItem>
                    <SelectItem value="month">Mês</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: '7 dias', days: 7 },
                { label: '30 dias', days: 30 },
                { label: '90 dias', days: 90 },
                { label: '1 ano', days: 365 },
              ].map((p) => (
                <Button
                  key={p.days}
                  variant="ghost"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setQuickPeriod(p.days)}
                >
                  {p.label}
                </Button>
              ))}
              {(startDate !== fmt(subDays(today, 30)) || endDate !== fmt(today) || grouping !== 'day') && (
                <Button variant="ghost" size="sm" className="text-xs h-8 gap-1 text-muted-foreground" onClick={clearFilters}>
                  <X className="w-3 h-3" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-border/40 shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{kpi.label}</p>
              <p className="text-lg sm:text-xl font-black text-foreground tracking-tight">{kpi.value}</p>
              <div className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${kpi.change > 0 ? 'text-green-600' : kpi.change < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {kpi.change > 0 ? <TrendingUp className="w-3 h-3" /> : kpi.change < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                <span>{kpi.change > 0 ? '+' : ''}{kpi.change.toFixed(1)}%</span>
                <span className="text-muted-foreground font-normal">vs anterior</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card className="border-border/40 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Receita por Período</p>
          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '10px',
                    color: 'hsl(var(--foreground))',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                  formatter={(v: number) => [formatCurrency(v), 'Receita']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(38 92% 50%)"
                  fill="url(#colorRevenue)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>



      {/* Pedidos por Período + Ticket Médio por Período */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Pedidos por Período</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersPerPeriod} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', color: 'hsl(var(--foreground))' }} formatter={(v: number) => [v, 'Pedidos']} />
                  <Bar dataKey="value" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Ticket Médio por Período</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ticketPerPeriod} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTicket" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={50} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', color: 'hsl(var(--foreground))' }} formatter={(v: number) => [formatCurrency(v), 'Ticket Médio']} />
                  <Area type="monotone" dataKey="value" stroke="hsl(38 92% 50%)" fill="url(#colorTicket)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Donuts: Status de Pagamento e Receita por Método */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: 'Status de Pagamento', data: paymentStatus },
          { title: 'Receita por Método', data: revenueByMethod },
        ].map((chart) => (
          <Card key={chart.title} className="border-border/40 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{chart.title}</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} strokeWidth={0}>
                      {chart.data.map((_, idx) => (
                        <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', color: 'hsl(var(--foreground))' }} formatter={(v: number, name: string) => [chart.title.includes('Receita') ? formatCurrency(v) : v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top 10 Produtos */}
      <Card className="border-border/40 shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Top 10 Produtos Mais Vendidos</p>
          {topProducts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhuma venda no período</p>
          ) : (
            <div style={{ height: Math.max(280, topProducts.length * 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={170}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', color: 'hsl(var(--foreground))' }}
                    formatter={(v: number) => [formatCurrency(v), 'Receita']}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;
