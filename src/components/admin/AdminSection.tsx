import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface AdminSectionProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Quando true, remove padding interno (útil para tabelas full-bleed) */
  flush?: boolean;
}

/**
 * Card-seção padrão do admin: borda suave, sombra discreta,
 * cabeçalho opcional com ícone dourado.
 */
export function AdminSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  flush = false,
}: AdminSectionProps) {
  const hasHeader = title || description || actions || Icon;
  return (
    <section
      className={cn(
        'rounded-xl border border-border/60 bg-card shadow-sm',
        className,
      )}
    >
      {hasHeader && (
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(flush ? '' : 'p-4 sm:p-5')}>{children}</div>
    </section>
  );
}
