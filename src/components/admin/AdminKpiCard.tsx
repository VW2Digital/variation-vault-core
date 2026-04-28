import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface AdminKpiCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Variação em % (positiva ou negativa) */
  delta?: number;
  /** Texto comparativo: "vs mês anterior" */
  deltaLabel?: string;
  /** Tipo de destaque visual do card */
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  hint?: string;
  className?: string;
}

const toneRing: Record<NonNullable<AdminKpiCardProps['tone']>, string> = {
  default: 'bg-muted text-foreground',
  primary: 'bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-sm shadow-primary/20',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
};

export function AdminKpiCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel = 'vs período anterior',
  tone = 'default',
  hint,
  className,
}: AdminKpiCardProps) {
  const isUp = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div className="mt-1.5 text-xl sm:text-2xl font-bold text-foreground truncate">
            {value}
          </div>
          {hint && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{hint}</p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              toneRing[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      {typeof delta === 'number' && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
              isUp ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
            )}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isUp ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
          <span className="text-muted-foreground truncate">{deltaLabel}</span>
        </div>
      )}
    </div>
  );
}
