import { Card, CardContent } from '@/components/ui/card';
import { Target, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';

interface Props {
  /** Receita acumulada do mês corrente. */
  currentMonthRevenue: number;
  /** Receita do mês anterior (para variação %). */
  previousMonthRevenue: number;
  /** Meta mensal definida. Se 0, usa 1.2x do mês anterior. */
  monthlyGoal: number;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Card de meta mensal estilo "Total Savings" da referência:
 * donut radial com % atingido e variação vs mês anterior.
 */
export function DashboardMonthlyGoal({
  currentMonthRevenue,
  previousMonthRevenue,
  monthlyGoal,
}: Props) {
  const goal = monthlyGoal > 0 ? monthlyGoal : Math.max(previousMonthRevenue * 1.2, 1000);
  const pct = Math.min(100, Math.round((currentMonthRevenue / goal) * 100));
  const variation =
    previousMonthRevenue > 0
      ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
      : currentMonthRevenue > 0
      ? 100
      : 0;

  const data = [{ name: 'meta', value: pct, fill: 'hsl(var(--primary))' }];

  return (
    <Card className="border-border/40 shadow-sm h-full">
      <CardContent className="p-5 sm:p-6 flex flex-col h-full">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Meta do Mês
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{formatBRL(goal)} de objetivo</p>
          </div>
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Target className="w-4 h-4 text-primary" />
          </div>
        </div>

        <div className="relative flex-1 flex items-center justify-center min-h-[160px]">
          <ResponsiveContainer width="100%" height={180}>
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="72%"
              outerRadius="100%"
              barSize={14}
              data={data}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                dataKey="value"
                background={{ fill: 'hsl(var(--muted))' }}
                cornerRadius={20}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {formatBRL(currentMonthRevenue)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">
              {pct}% da meta
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/40 border border-border/40 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">vs mês anterior</span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold ${
              variation >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            <TrendingUp className={`w-3 h-3 ${variation < 0 ? 'rotate-180' : ''}`} />
            {variation >= 0 ? '+' : ''}
            {variation.toFixed(1)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
