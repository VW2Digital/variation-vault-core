import { useEffect, useState, useMemo } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Tag, AlertTriangle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useNavigate } from 'react-router-dom';
import { DashboardSalesOverview } from '@/components/admin/DashboardSalesOverview';
import { DashboardRecentActivity, type ActivityItem } from '@/components/admin/DashboardRecentActivity';
import { DashboardMostRecentProducts } from '@/components/admin/DashboardMostRecentProducts';
import { DashboardTopKpis } from '@/components/admin/DashboardTopKpis';

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

const CONFIRMED_STATUSES = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];

function filterByPeriod<T extends { created_at: string }>(items: T[], days: PeriodKey): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(days));
  return items.filter(i => new Date(i.created_at) >= cutoff);
}

function buildChartData(orders: RawOrder[], days: PeriodKey) {
  const now = new Date();
  const numDays = Number(days);
  const map = new Map<string, { receita: number }>();

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { receita: 0 });
  }

  orders.forEach(o => {
    if (!CONFIRMED_STATUSES.includes(o.status)) return;
    const key = new Date(o.created_at).toISOString().slice(0, 10);
    const entry = map.get(key);
    if (entry) entry.receita += Number(o.total_value || 0);
  });

  return Array.from(map.entries()).map(([date, data]) => ({
    date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
    ...data,
  }));
}

const Dashboard = () => {
  const [allOrders, setAllOrders] = useState<RawOrder[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [paidWithoutLabel, setPaidWithoutLabel] = useState(0);
  const [totalClients, setTotalClients] = useState(0);
  const [recentSignups, setRecentSignups] = useState<{ id: string; full_name: string | null; created_at: string }[]>([]);
  const [recentTickets, setRecentTickets] = useState<{ id: string; subject: string | null; created_at: string }[]>([]);
  const [recentFailures, setRecentFailures] = useState<{ id: string; customer_email: string | null; created_at: string; error_message?: string | null }[]>([]);
  const [outOfStock, setOutOfStock] = useState(0);
  const [dismissedLabelsAlert, setDismissedLabelsAlert] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('dismiss_labels_alert') === '1'
  );
  const [dismissedStockAlert, setDismissedStockAlert] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('dismiss_stock_alert') === '1'
  );
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const products = await fetchProducts();
      const oos = products.reduce(
        (acc: number, p: any) => acc + (p.product_variations?.filter((v: any) => !v.in_stock).length || 0),
        0
      );
      setOutOfStock(oos);
      setAllProducts(products);

      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, payment_method, total_value, customer_email, customer_name, product_name, created_at')
        .order('created_at', { ascending: false });
      setAllOrders((orders as RawOrder[]) || []);

      const { count: labelCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['PAID', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
        .is('label_url', null);
      setPaidWithoutLabel(labelCount || 0);

      const { count: profileCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      setTotalClients(profileCount || 0);

      const { data: signups } = await supabase
        .from('profiles')
        .select('id, full_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentSignups((signups as any) || []);

      const { data: tickets } = await supabase
        .from('support_tickets')
        .select('id, subject, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentTickets((tickets as any) || []);

      const { data: failures } = await supabase
        .from('payment_logs')
        .select('id, customer_email, created_at, error_message')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentFailures((failures as any) || []);

      setLoading(false);
    };
    load();
  }, []);

  const totalRevenuePeriod = useMemo(() => {
    return filterByPeriod(allOrders, period)
      .filter((o) => CONFIRMED_STATUSES.includes(o.status))
      .reduce((s, o) => s + Number(o.total_value || 0), 0);
  }, [allOrders, period]);

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

  const chartData = useMemo(
    () => buildChartData(filterByPeriod(allOrders, period), period),
    [allOrders, period]
  );

  // KPIs do topo: hoje vs ontem
  const topKpis = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);

    let revToday = 0, revYesterday = 0;
    let ordersTodayCount = 0, ordersYesterdayCount = 0;

    allOrders.forEach((o) => {
      const d = new Date(o.created_at);
      const v = Number(o.total_value || 0);
      const isConfirmed = CONFIRMED_STATUSES.includes(o.status);
      if (d >= startToday) {
        ordersTodayCount++;
        if (isConfirmed) revToday += v;
      } else if (d >= startYesterday && d < startToday) {
        ordersYesterdayCount++;
        if (isConfirmed) revYesterday += v;
      }
    });

    const newCustomersToday = recentSignups.filter((s) => new Date(s.created_at) >= startToday).length;
    const newCustomersYesterday = recentSignups.filter((s) => {
      const d = new Date(s.created_at);
      return d >= startYesterday && d < startToday;
    }).length;

    const pct = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    return {
      revenueToday: revToday,
      revenueDelta: pct(revToday, revYesterday),
      ordersToday: ordersTodayCount,
      ordersDelta: pct(ordersTodayCount, ordersYesterdayCount),
      totalCustomers: totalClients,
      customersDelta: pct(newCustomersToday, newCustomersYesterday),
    };
  }, [allOrders, recentSignups, totalClients]);

  const salesBars = useMemo(() => {
    // Mostra todos os pontos do período selecionado.
    // Para 90d agrupamos por semana para não ficar ilegível.
    if (period === '90') {
      const buckets: { label: string; value: number }[] = [];
      for (let i = 0; i < chartData.length; i += 7) {
        const slice = chartData.slice(i, i + 7);
        const value = slice.reduce((s, p) => s + p.receita, 0);
        const label = slice[0]?.date.split('/')[0] || '';
        buckets.push({ label, value });
      }
      return buckets;
    }
    return chartData.map((p) => ({ label: p.date.split('/')[0], value: p.receita }));
  }, [chartData, period]);

  const activityItems = useMemo<ActivityItem[]>(() => {
    const fmt = (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      const min = Math.floor(diff / 60000);
      if (min < 1) return 'agora';
      if (min < 60) return `${min} min atrás`;
      const h = Math.floor(min / 60);
      if (h < 24) return `${h} h atrás`;
      const d = Math.floor(h / 24);
      return `${d} d atrás`;
    };
    const items: (ActivityItem & { _ts: number })[] = [];
    allOrders.slice(0, 5).forEach((o) => {
      items.push({
        _ts: new Date(o.created_at).getTime(),
        id: `o-${o.id}`,
        type: 'order',
        title: o.customer_name || o.customer_email || 'Novo pedido',
        description: `Pediu ${o.product_name || 'um produto'} • ${o.status}`,
        timeAgo: fmt(o.created_at),
        link: o.id ? `/admin/pedidos/${o.id}` : '/admin/pedidos',
      });
    });
    recentTickets.slice(0, 3).forEach((t) => {
      items.push({
        _ts: new Date(t.created_at).getTime(),
        id: `t-${t.id}`,
        type: 'support',
        title: 'Novo chamado de suporte',
        description: t.subject || 'Cliente abriu um chamado',
        timeAgo: fmt(t.created_at),
        link: '/admin/suporte',
        cta: { acceptLabel: 'Responder', declineLabel: 'Depois' },
      });
    });
    recentFailures.slice(0, 3).forEach((f) => {
      items.push({
        _ts: new Date(f.created_at).getTime(),
        id: `f-${f.id}`,
        type: 'failure',
        title: 'Falha de pagamento',
        description: `${f.customer_email || 'Cliente'} • ${f.error_message || 'Pagamento recusado'}`,
        timeAgo: fmt(f.created_at),
        link: '/admin/falhas-pagamento',
      });
    });
    recentSignups.slice(0, 3).forEach((s) => {
      items.push({
        _ts: new Date(s.created_at).getTime(),
        id: `s-${s.id}`,
        type: 'signup',
        title: 'Novo cliente cadastrado',
        description: s.full_name || 'Conta criada com sucesso',
        timeAgo: fmt(s.created_at),
        link: '/admin/usuarios',
      });
    });
    return items
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 6)
      .map(({ _ts, ...rest }) => rest);
  }, [allOrders, recentTickets, recentFailures, recentSignups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Alertas operacionais */}
      {paidWithoutLabel > 0 && !dismissedLabelsAlert && (
        <Alert
          className="relative border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 cursor-pointer pr-12 [&>svg]:text-amber-600"
          onClick={() => navigate('/admin/pedidos')}
        >
          <Tag className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-semibold">Etiquetas pendentes</AlertTitle>
          <AlertDescription>
            {paidWithoutLabel === 1
              ? 'Há 1 pedido pago aguardando geração de etiqueta de envio.'
              : `Há ${paidWithoutLabel} pedidos pagos aguardando geração de etiqueta de envio.`}
          </AlertDescription>
          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={(e) => {
              e.stopPropagation();
              sessionStorage.setItem('dismiss_labels_alert', '1');
              setDismissedLabelsAlert(true);
            }}
            className="absolute top-1/2 -translate-y-1/2 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-600 hover:bg-amber-700 transition-colors shadow-md ring-2 ring-amber-200 text-white text-lg leading-none font-bold"
          >
            ×
          </button>
        </Alert>
      )}

      {/* KPIs do topo (Receita Hoje, Pedidos, Clientes) */}
      <DashboardTopKpis
        revenueToday={topKpis.revenueToday}
        revenueDelta={topKpis.revenueDelta}
        ordersToday={topKpis.ordersToday}
        ordersDelta={topKpis.ordersDelta}
        totalCustomers={topKpis.totalCustomers}
        customersDelta={topKpis.customersDelta}
      />

      {/* Vendas — full-width */}
      <DashboardSalesOverview
        total={totalRevenuePeriod}
        delta={previousPeriodRevenue > 0
          ? ((totalRevenuePeriod - previousPeriodRevenue) / previousPeriodRevenue) * 100
          : totalRevenuePeriod > 0 ? 100 : 0}
        bars={salesBars}
        range={period}
        onRangeChange={(v) => setPeriod(v)}
      />

      {/* Produtos Recentes + Atividade Recente lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardMostRecentProducts products={allProducts as any} />
        <DashboardRecentActivity items={activityItems} />
      </div>

      {/* Alerta de estoque */}
      {outOfStock > 0 && !dismissedStockAlert && (
        <div
          className="relative flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 pr-10 cursor-pointer hover:bg-destructive/10 transition-colors"
          onClick={() => navigate('/admin/produtos')}
        >
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-foreground">
            <span className="font-bold">{outOfStock} variação(ões)</span> sem estoque. Toque para revisar o catálogo.
          </p>
          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={(e) => {
              e.stopPropagation();
              sessionStorage.setItem('dismiss_stock_alert', '1');
              setDismissedStockAlert(true);
            }}
            className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-md text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
