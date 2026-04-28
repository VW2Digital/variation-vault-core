import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import heroCard from '@/assets/admin-hero-card.png';

interface Props {
  /** Receita do período atual (já filtrada). */
  currentRevenue: number;
  /** Receita do período anterior equivalente, para variação %. */
  previousRevenue: number;
  /** Rótulo curto do período. Ex: "30 dias". */
  periodLabel: string;
  /** Texto auxiliar abaixo do valor. Ex: "Atualizado em tempo real". */
  subline?: string;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Hero KPI inspirado no card "Total Balance" da referência:
 * gradiente dourado, valor grande, badge de variação % e ilustração de cartão.
 */
export function DashboardHero({
  currentRevenue,
  previousRevenue,
  periodLabel,
  subline,
}: Props) {
  // Animação de contagem do número (efeito "rolagem")
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const start = displayValue;
    const end = currentRevenue;
    const duration = 700;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(start + (end - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRevenue]);

  const variation = useMemo(() => {
    if (!previousRevenue || previousRevenue === 0) {
      return { pct: currentRevenue > 0 ? 100 : 0, direction: currentRevenue > 0 ? 'up' : 'flat' as const };
    }
    const pct = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    return {
      pct,
      direction: pct > 0.5 ? ('up' as const) : pct < -0.5 ? ('down' as const) : ('flat' as const),
    };
  }, [currentRevenue, previousRevenue]);

  const VarIcon = variation.direction === 'up' ? TrendingUp : variation.direction === 'down' ? TrendingDown : Minus;
  const varColor =
    variation.direction === 'up'
      ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
      : variation.direction === 'down'
      ? 'text-rose-600 bg-rose-500/10 border-rose-500/20'
      : 'text-muted-foreground bg-muted border-border/40';

  return (
    <Card className="relative overflow-hidden border-border/40 shadow-sm h-full">
      {/* Fundo com gradiente sutil dourado */}
      <div
        className="absolute inset-0 -z-10 opacity-90"
        style={{
          background:
            'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card)) 60%, hsl(var(--primary) / 0.08) 100%)',
        }}
      />
      <div className="absolute -right-10 -top-10 w-72 h-72 rounded-full bg-primary/10 blur-3xl -z-10" />

      <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Receita Total
          </p>

          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
              {formatBRL(displayValue).replace(/,\d{2}$/, '')}
            </h2>
            <span className="text-base sm:text-lg font-bold text-muted-foreground">
              ,{currentRevenue.toFixed(2).split('.')[1]}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${varColor}`}>
              <VarIcon className="w-3 h-3" />
              {variation.pct >= 0 ? '+' : ''}
              {variation.pct.toFixed(1)}% vs período anterior
            </span>
            <span className="text-[11px] text-muted-foreground">
              {subline || `Últimos ${periodLabel}`}
            </span>
          </div>
        </div>

        {/* Ilustração */}
        <div className="shrink-0 w-32 sm:w-40 lg:w-48 self-end sm:self-auto">
          <img
            src={heroCard}
            alt=""
            aria-hidden
            className="w-full h-auto drop-shadow-xl"
            loading="lazy"
            width={1024}
            height={1024}
          />
        </div>
      </div>
    </Card>
  );
}
