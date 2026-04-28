import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, Target, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  balance: number;
  balanceDelta: number;
  achievementRate: number;
  customers: number;
  customersDelta: number;
  range: 'month' | 'quarter' | 'year';
  onRangeChange: (v: 'month' | 'quarter' | 'year') => void;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function shortBRL(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return formatBRL(v);
}

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
        positive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
      }`}
    >
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/**
 * Card "Overall Summary" inspirado na referência: 3 colunas internas
 * (Saldo, Taxa de Conquista em destaque, Clientes), com seletor de período.
 */
export function DashboardOverallSummary({
  balance,
  balanceDelta,
  achievementRate,
  customers,
  customersDelta,
  range,
  onRangeChange,
}: Props) {
  const rangeLabel: Record<typeof range, string> = {
    month: 'mês passado',
    quarter: 'trimestre passado',
    year: 'ano passado',
  };

  return (
    <Card className="border-border/40 shadow-sm overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">Resumo Geral</h2>
          <Select value={range} onValueChange={(v) => onRangeChange(v as any)}>
            <SelectTrigger className="h-8 w-[140px] text-xs rounded-full bg-muted/50 border-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Último mês</SelectItem>
              <SelectItem value="quarter">Último trimestre</SelectItem>
              <SelectItem value="year">Último ano</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-2">
          {/* Saldo */}
          <div className="rounded-xl p-4 bg-card sm:bg-transparent">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Wallet className="w-3.5 h-3.5" /> Saldo
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{shortBRL(balance)}</p>
              <Delta value={balanceDelta} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">vs. {rangeLabel[range]}</p>
          </div>

          {/* Taxa de Conquista (destaque) */}
          <div className="rounded-2xl p-4 bg-card border border-border/60 shadow-sm relative">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Target className="w-3.5 h-3.5" /> Taxa de Conquista
            </div>
            <p className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">{achievementRate.toFixed(0)}%</p>
            <p className="text-[11px] text-muted-foreground mt-1">Pedidos pagos / total</p>
          </div>

          {/* Clientes */}
          <div className="rounded-xl p-4 bg-card sm:bg-transparent">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Users className="w-3.5 h-3.5" /> Clientes
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                {customers.toLocaleString('pt-BR')}
              </p>
              <Delta value={customersDelta} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">vs. {rangeLabel[range]}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}