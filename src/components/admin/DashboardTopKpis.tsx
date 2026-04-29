import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, ShoppingBag, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import goldBars from '@/assets/gold-bars.png';
import ordersDecoration from '@/assets/orders-decoration.png';
import customersDecoration from '@/assets/customers-decoration.png';

interface KpiProps {
  revenueToday: number;
  revenueDelta: number;
  ordersToday: number;
  ordersDelta: number;
  totalCustomers: number;
  customersDelta: number;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const color = positive ? 'text-emerald-600' : 'text-destructive';
  return (
    <p className={`text-xs font-semibold inline-flex items-center gap-1 ${color}`}>
      <Icon className="w-3 h-3" />
      {positive ? '+' : ''}
      {value.toFixed(2).replace('.', ',')}% vs ontem
    </p>
  );
}

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  tint,
  decoration,
}: {
  label: string;
  value: string;
  delta: number;
  icon: any;
  tint: string;
  decoration?: string;
}) {
  return (
    <Card className="border-border/40 shadow-sm overflow-hidden relative">
      <CardContent className={`p-5 ${tint} relative`}>
        {decoration && (
          <img
            src={decoration}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="pointer-events-none select-none absolute -right-3 -bottom-3 w-20 sm:w-24 md:w-28 h-auto opacity-70 sm:opacity-80 drop-shadow-md"
          />
        )}
        <div className="flex items-start justify-between mb-3 relative z-10">
          <p className="text-sm font-semibold text-foreground/80">{label}</p>
        </div>
        <p className="text-3xl font-bold text-foreground mb-2 tracking-tight relative z-10">{value}</p>
        <div className="relative z-10">
          <Delta value={delta} />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTopKpis({
  revenueToday,
  revenueDelta,
  ordersToday,
  ordersDelta,
  totalCustomers,
  customersDelta,
}: KpiProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label="Receita Hoje"
        value={formatBRL(revenueToday)}
        delta={revenueDelta}
        icon={DollarSign}
        tint="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent"
        decoration={goldBars}
      />
      <KpiCard
        label="Pedidos Hoje"
        value={ordersToday.toString()}
        delta={ordersDelta}
        icon={ShoppingBag}
        tint="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent"
        decoration={ordersDecoration}
      />
      <KpiCard
        label="Clientes"
        value={totalCustomers.toLocaleString('pt-BR')}
        delta={customersDelta}
        icon={Users}
        tint="bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent"
        decoration={customersDecoration}
      />
    </div>
  );
}