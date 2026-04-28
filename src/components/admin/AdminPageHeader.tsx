import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface AdminBreadcrumbItem {
  label: string;
  /** Se informado, vira link clicável; o último item é sempre página atual. */
  to?: string;
}

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  /** Conteúdo extra abaixo do título (filtros, abas, etc) */
  children?: ReactNode;
  /**
   * Trilha de navegação opcional renderizada acima do título.
   * Use em páginas internas (ex.: Pedidos › #1234, Comunicação › Templates).
   * Quando informada, evita a necessidade de um botão "Voltar" duplicado.
   */
  breadcrumbs?: AdminBreadcrumbItem[];
}

/**
 * Cabeçalho padrão das páginas do admin.
 * Aplica a identidade gold/amber Liberty: hero suave com gradiente,
 * círculo dourado com ícone à esquerda, ações à direita.
 */
export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  children,
  breadcrumbs,
}: AdminPageHeaderProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 px-5 py-5 sm:px-7 sm:py-6 shadow-sm',
        className,
      )}
    >
      {/* glow decorativo */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />

      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Trilha"
          className="relative mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((item, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <span key={`${item.label}-${idx}`} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
                {isLast || !item.to ? (
                  <span className="font-medium text-foreground/80 truncate max-w-[14rem]">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    className="hover:text-primary transition-colors truncate max-w-[12rem]"
                  >
                    {item.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          {Icon && (
            <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md shadow-primary/20">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>

      {children && <div className="relative mt-5">{children}</div>}
    </div>
  );
}
