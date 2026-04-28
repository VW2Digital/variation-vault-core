import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, TrendingUp, ShoppingBag, CreditCard, QrCode, Package, MoreVertical, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const CONFIRMED = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];

interface Order {
  id: string;
  status: string;
  payment_method: string | null;
  total_value: number | null;
  customer_name: string | null;
  customer_email: string | null;
  product_name: string | null;
  created_at: string;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * "Carteira de Vendas" — visão financeira inspirada na referência Wallet.
 * Mantém paleta dourada/âmbar Liberty Pharma.
 */
export default function SalesWallet() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, status, payment_method, total_value, customer_name, customer_email, product_name, created_at')
        .order('created_at', { ascending: false });
      setOrders((data as Order[]) || []);
      setLoading(false);
    })();
  }, []);

  const confirmed = useMemo(() => orders.filter((o) => CONFIRMED.includes(o.status)), [orders]);

  // Saldo total (acumulado)
  const totalRevenue = useMemo(
    () => confirmed.reduce((s, o) => s + Number(o.total_value || 0), 0),
    [confirmed]
  );

  // Variação mês atual vs mês anterior
  const { currentMonth, prevMonth, monthDelta } = useMemo(() => {
    const now = new Date();
    const cm = new Date(now.getFullYear(), now.getMonth(), 1);
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pmEnd = cm;
    const cur = confirmed
      .filter((o) => new Date(o.created_at) >= cm)
      .reduce((s, o) => s + Number(o.total_value || 0), 0);
    const prev = confirmed
      .filter((o) => {
        const d = new Date(o.created_at);
        return d >= pm && d < pmEnd;
      })
      .reduce((s, o) => s + Number(o.total_value || 0), 0);
    const delta = prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;
    return { currentMonth: cur, prevMonth: prev, monthDelta: delta };
  }, [confirmed]);

  // Fluxo de Vendas (PIX vs Cartão por mês ou ano)
  const flowData = useMemo(() => {
    if (period === 'monthly') {
      const year = new Date().getFullYear();
      return MONTH_NAMES.map((label, idx) => {
        const monthOrders = confirmed.filter((o) => {
          const d = new Date(o.created_at);
          return d.getFullYear() === year && d.getMonth() === idx;
        });
        const pix = monthOrders
          .filter((o) => o.payment_method === 'pix')
          .reduce((s, o) => s + Number(o.total_value || 0), 0);
        const card = monthOrders
          .filter((o) => o.payment_method === 'credit_card')
          .reduce((s, o) => s + Number(o.total_value || 0), 0);
        return { label, pix, card, total: pix + card };
      });
    }
    // yearly: últimos 6 anos
    const now = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => {
      const year = now - 5 + i;
      const list = confirmed.filter((o) => new Date(o.created_at).getFullYear() === year);
      const pix = list
        .filter((o) => o.payment_method === 'pix')
        .reduce((s, o) => s + Number(o.total_value || 0), 0);
      const card = list
        .filter((o) => o.payment_method === 'credit_card')
        .reduce((s, o) => s + Number(o.total_value || 0), 0);
      return { label: String(year), pix, card, total: pix + card };
    });
  }, [confirmed, period]);

  const flowMax = Math.max(...flowData.map((d) => d.total), 1);
  const peakIndex = flowData.reduce((best, d, i, arr) => (d.total > arr[best].total ? i : best), 0);

  // Dia útil vs fim de semana
  const { weekdayPct, weekendPct, weekdayValue, weekendValue, totalAmount } = useMemo(() => {
    let wd = 0;
    let we = 0;
    confirmed.forEach((o) => {
      const day = new Date(o.created_at).getDay(); // 0 dom, 6 sáb
      const v = Number(o.total_value || 0);
      if (day === 0 || day === 6) we += v;
      else wd += v;
    });
    const total = wd + we;
    return {
      weekdayValue: wd,
      weekendValue: we,
      totalAmount: total,
      weekdayPct: total > 0 ? Math.round((wd / total) * 100) : 0,
      weekendPct: total > 0 ? Math.round((we / total) * 100) : 0,
    };
  }, [confirmed]);

  // Pedidos recentes
  const recent = useMemo(() => orders.slice(0, 4), [orders]);

  // Meta de vendas (ticket × pedidos confirmados / projetado)
  const goalPct = useMemo(() => {
    if (totalRevenue === 0) return 0;
    // simples: % do mês atual contra (mês anterior * 1.2 como meta)
    const goal = Math.max(prevMonth * 1.2, 1);
    return Math.min(100, Math.round((currentMonth / goal) * 100));
  }, [currentMonth, prevMonth, totalRevenue]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">Vendas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Visão financeira das vendas confirmadas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* Saldo Total Hero */}
          <Card className="border-border/40 shadow-sm overflow-hidden relative">
            <CardContent className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4 relative z-10">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Saldo Total</p>
                  <p className="text-4xl sm:text-5xl font-black text-foreground tracking-tight">
                    {formatBRL(totalRevenue).split(',')[0]}
                    <span className="text-2xl sm:text-3xl text-muted-foreground">,{(totalRevenue.toFixed(2)).split('.')[1]}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${monthDelta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {monthDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(monthDelta).toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-muted-foreground">vs. mês anterior</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Atualizado agora</p>
                </div>
                {/* Ilustração estilizada (cartão) */}
                <div className="hidden sm:block shrink-0 w-40 h-24 relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-primary/40 shadow-lg rotate-[-8deg] translate-x-2 translate-y-1 opacity-60" />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-xl rotate-[6deg] flex flex-col justify-between p-3">
                    <div className="flex items-center justify-between">
                      <div className="w-6 h-4 rounded-sm bg-amber-200/80" />
                      <Wallet className="w-4 h-4 text-primary-foreground/80" />
                    </div>
                    <p className="text-[10px] font-mono text-primary-foreground/90 tracking-widest">•••• 4242</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fluxo de Vendas */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-bold text-foreground">Fluxo de Vendas</CardTitle>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-primary" /> PIX
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-primary/30" /> Cartão
                  </span>
                </div>
              </div>
              <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
                <SelectTrigger className="h-8 w-[110px] text-xs rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="relative h-64 sm:h-72">
                {/* Eixo Y simples */}
                <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[10px] text-muted-foreground">
                  {[1, 0.75, 0.5, 0.25, 0].map((p, i) => (
                    <span key={i}>{(flowMax * p / 1000).toFixed(0)}k</span>
                  ))}
                </div>
                {/* Barras pontilhadas */}
                <div className="absolute left-10 right-0 top-0 bottom-6 flex items-end justify-between gap-1.5">
                  {flowData.map((d, i) => {
                    const isPeak = i === peakIndex && d.total > 0;
                    const heightPct = (d.total / flowMax) * 100;
                    const dots = Math.max(1, Math.round(heightPct / 6));
                    return (
                      <div key={i} className="relative flex-1 flex flex-col items-center justify-end h-full">
                        {isPeak && (
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap">
                            Pico
                            <div className="text-[9px] font-semibold opacity-80">{formatBRL(d.total).replace('R$', 'R$ ')}</div>
                          </div>
                        )}
                        <div className="flex flex-col items-center gap-1 w-full" style={{ height: `${heightPct}%` }}>
                          {Array.from({ length: dots }).map((_, k) => (
                            <div
                              key={k}
                              className={`w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full ${isPeak ? 'bg-primary' : 'bg-primary/25'}`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Eixo X */}
                <div className="absolute left-10 right-0 bottom-0 flex justify-between gap-1.5">
                  {flowData.map((d) => (
                    <span key={d.label} className={`flex-1 text-center text-[10px] ${d.label === flowData[peakIndex].label ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transações Monetárias - Working Days vs Weekend */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-bold text-foreground">Transações por Período</CardTitle>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-2xl sm:text-3xl font-black text-foreground">{formatBRL(totalAmount)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /> Dias úteis</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary/30" /> Fim de semana</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <BarPercent label="Dias úteis" value={weekdayValue} pct={weekdayPct} tone="solid" />
              <BarPercent label="Fim de semana" value={weekendValue} pct={weekendPct} tone="muted" />
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-4">
          {/* Pedidos Recentes */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-bold text-foreground">Pedidos Recentes</CardTitle>
              <button className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Mais opções">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Sem pedidos.</p>
              ) : (
                <ul className="space-y-3">
                  {recent.map((o) => {
                    const isPix = o.payment_method === 'pix';
                    const Icon = isPix ? QrCode : o.payment_method === 'credit_card' ? CreditCard : ShoppingBag;
                    const confirmedFlag = CONFIRMED.includes(o.status);
                    return (
                      <li key={o.id} className="flex items-center gap-3">
                        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${isPix ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {isPix ? 'Pagamento PIX' : o.payment_method === 'credit_card' ? 'Pagamento Cartão' : 'Pedido'}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {confirmedFlag ? 'Pago com sucesso' : o.status} • {o.product_name || o.customer_name || '-'}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-foreground shrink-0">{formatBRL(Number(o.total_value || 0))}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Meta de Vendas (donut) */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-bold text-foreground">Meta do Mês</CardTitle>
              <button className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Mais opções">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center my-2">
                <Donut percent={goalPct} value={formatBRL(currentMonth)} />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-muted-foreground">vs. mês anterior</span>
                <span className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${monthDelta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {monthDelta >= 0 ? '+' : ''}{monthDelta.toFixed(1)}%
                </span>
              </div>
              <div className="mt-4 pt-4 border-t border-border/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Faturado este mês</span>
                  <button className="w-5 h-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Detalhes">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-xl font-black text-foreground">{formatBRL(currentMonth)}</p>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {goalPct}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {loading && <p className="text-center text-xs text-muted-foreground">Carregando dados…</p>}
    </div>
  );
}

function BarPercent({ label, value, pct, tone }: { label: string; value: number; pct: number; tone: 'solid' | 'muted' }) {
  const dots = 40;
  const filled = Math.round((pct / 100) * dots);
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="font-bold text-foreground">{pct}%</span>
      </div>
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: dots }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-4 rounded-sm ${i < filled ? (tone === 'solid' ? 'bg-primary' : 'bg-primary/60') : 'bg-primary/10'}`}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
    </div>
  );
}

function Donut({ percent, value }: { percent: number; value: string }) {
  const size = 160;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--primary))"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">Faturado</span>
        <span className="text-base font-black text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">{percent}% da meta</span>
      </div>
    </div>
  );
}