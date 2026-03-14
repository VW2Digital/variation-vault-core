import { useEffect, useState } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, DollarSign, AlertTriangle, TrendingUp, CreditCard, QrCode, RefreshCw, ShoppingCart, CheckCircle2, XCircle, ArrowRightLeft } from 'lucide-react';

interface PaymentMetrics {
  totalOrders: number;
  confirmedOrders: number;
  pendingOrders: number;
  failedPayments: number;
  pixOrders: number;
  cardOrders: number;
  pixFailures: number;
  cardFailures: number;
  pixRecoveries: number;
  totalRevenue: number;
  conversionRate: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState({ total: 0, variations: 0, outOfStock: 0 });
  const [metrics, setMetrics] = useState<PaymentMetrics>({
    totalOrders: 0, confirmedOrders: 0, pendingOrders: 0, failedPayments: 0,
    pixOrders: 0, cardOrders: 0, pixFailures: 0, cardFailures: 0,
    pixRecoveries: 0, totalRevenue: 0, conversionRate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Products
      const products = await fetchProducts();
      const variations = products.reduce((acc: number, p: any) => acc + (p.product_variations?.length || 0), 0);
      const outOfStock = products.reduce(
        (acc: number, p: any) => acc + (p.product_variations?.filter((v: any) => !v.in_stock).length || 0),
        0
      );
      setStats({ total: products.length, variations, outOfStock });

      // Orders
      const { data: orders } = await supabase
        .from('orders')
        .select('status, payment_method, total_value, customer_email');

      const allOrders = orders || [];
      const totalOrders = allOrders.length;
      const confirmed = allOrders.filter(o => ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(o.status)).length;
      const pending = allOrders.filter(o => o.status === 'PENDING').length;
      const pixOrders = allOrders.filter(o => o.payment_method === 'pix').length;
      const cardOrders = allOrders.filter(o => o.payment_method === 'credit_card').length;
      const totalRevenue = allOrders
        .filter(o => ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(o.status))
        .reduce((sum, o) => sum + Number(o.total_value || 0), 0);

      // Payment failures
      const { data: logs } = await supabase
        .from('payment_logs')
        .select('payment_method, customer_email, error_message');

      const allLogs = logs || [];
      const failedPayments = allLogs.length;
      const pixFailures = allLogs.filter(l => l.payment_method === 'pix').length;
      const cardFailures = allLogs.filter(l => l.payment_method === 'credit_card').length;

      // PIX recoveries: customers who had a card failure but later completed a PIX order
      const cardFailEmails = new Set(
        allLogs
          .filter(l => l.payment_method === 'credit_card' && l.customer_email)
          .map(l => l.customer_email!.toLowerCase())
      );
      const pixSuccessEmails = new Set(
        allOrders
          .filter(o => o.payment_method === 'pix' && ['CONFIRMED', 'RECEIVED', 'PENDING'].includes(o.status) && o.customer_email)
          .map(o => o.customer_email.toLowerCase())
      );
      let pixRecoveries = 0;
      cardFailEmails.forEach(email => {
        if (pixSuccessEmails.has(email)) pixRecoveries++;
      });

      const conversionRate = totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0;

      setMetrics({
        totalOrders, confirmedOrders: confirmed, pendingOrders: pending,
        failedPayments, pixOrders, cardOrders, pixFailures, cardFailures,
        pixRecoveries, totalRevenue, conversionRate,
      });
      setLoading(false);
    };
    load();
  }, []);

  const productCards = [
    { label: 'Produtos', value: stats.total, icon: Package, color: 'text-primary' },
    { label: 'Variações', value: stats.variations, icon: DollarSign, color: 'text-accent' },
    { label: 'Sem Estoque', value: stats.outOfStock, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

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
              {/* Main KPIs */}
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

              {/* Revenue */}
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

              {/* By Method */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PIX */}
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

                {/* Card */}
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

              {/* PIX Recovery */}
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
