import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Bar {
  label: string;
  value: number;
}

interface Props {
  total: number;
  delta: number;
  bars: Bar[];
  range: '7' | '30' | '90';
  onRangeChange: (v: '7' | '30' | '90') => void;
}

function shortBRL(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/**
 * "Sales Overview" — gráfico de barras com pico destacado e tooltip
 * fixo no maior valor, no estilo da referência.
 */
export function DashboardSalesOverview({ total, delta, bars, range, onRangeChange }: Props) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const peakIdx = bars.reduce((best, b, i, arr) => (b.value > arr[best].value ? i : best), 0);
  const positive = delta >= 0;

  return (
    <Card className="border-border/40 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Visão de Vendas</h2>
          <Select value={range} onValueChange={(v) => onRangeChange(v as any)}>
            <SelectTrigger className="h-8 w-[130px] text-xs rounded-full bg-muted/50 border-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-end">
          <div className="sm:pb-6">
            <p className="text-3xl sm:text-5xl font-black text-foreground tracking-tight leading-none">
              {shortBRL(total)}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
                  positive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(delta).toFixed(1)}%
              </span>
              <span className="text-[11px] text-muted-foreground">vs. período anterior</span>
            </div>
          </div>

          {/* Barras */}
          <div className="relative h-48 sm:h-56 min-w-0">
            <div className="absolute inset-x-0 top-0 bottom-6 flex items-end justify-between gap-[3px] sm:gap-1">
              {bars.map((b, i) => {
                const isPeak = i === peakIdx && b.value > 0;
                const heightPct = Math.max(4, (b.value / max) * 100);
                return (
                  <div key={i} className="relative flex-1 flex flex-col items-center justify-end h-full">
                    {isPeak && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap z-10 pointer-events-none">
                        {shortBRL(b.value)}
                        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-foreground" />
                      </div>
                    )}
                    <div
                      className={`w-full rounded-t-md sm:rounded-t-lg transition-all duration-500 ${
                        isPeak ? 'bg-primary shadow-md' : 'bg-primary/15'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex justify-between gap-[3px] sm:gap-1">
              {bars.map((b, i) => {
                // Para muitos pontos, mostra rótulo a cada N barras
                const step = bars.length > 20 ? Math.ceil(bars.length / 8) : 1;
                const show = i === peakIdx || i === 0 || i === bars.length - 1 || i % step === 0;
                return (
                  <span
                    key={i}
                    className={`flex-1 text-center text-[10px] ${
                      i === peakIdx ? 'text-foreground font-bold' : 'text-muted-foreground'
                    }`}
                  >
                    {show ? b.label : ''}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}