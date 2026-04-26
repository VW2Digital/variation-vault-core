import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface SettingsBreadcrumbItem {
  /** Visible label */
  label: string;
  /** If provided, item is rendered as a link. Last item is always rendered as the current page. */
  to?: string;
}

export interface SettingsHeaderProps {
  /** Main title shown in the header */
  title: ReactNode;
  /** Optional subtitle / description shown below the title */
  description?: ReactNode;
  /** Optional icon / image rendered before the title (e.g. gateway logo) */
  icon?: ReactNode;
  /**
   * Behaviour of the leading action button.
   * - "back" (default): renders an ArrowLeft and navigates to `backTo` (or "/admin/configuracoes").
   * - "close": renders an X — useful inside Sheets/Dialogs. Requires `onAction`.
   * - "none": hides the leading action.
   */
  action?: 'back' | 'close' | 'none';
  /** Custom handler for the leading action. Overrides default navigation. */
  onAction?: () => void;
  /** Destination for the default back navigation. Defaults to "/admin/configuracoes". */
  backTo?: string;
  /** Extra content rendered on the right side (e.g. status badges, actions). */
  rightSlot?: ReactNode;
  /** Additional classes for the wrapper */
  className?: string;
  /**
   * Optional breadcrumb trail rendered above the title.
   * If omitted (and `showBreadcrumb` is true, the default), a simple
   * "Configurações › <title>" trail is generated automatically when the
   * `title` is a plain string.
   */
  breadcrumbs?: SettingsBreadcrumbItem[];
  /** Set to false to hide the breadcrumb entirely. Defaults to true. */
  showBreadcrumb?: boolean;
}

/**
 * Shared header for settings pages and inner Sheets.
 * Standardises the back/close button + title + description layout
 * used across /admin/configuracoes/* screens.
 */
const SettingsHeader = ({
  title,
  description,
  icon,
  action = 'back',
  onAction,
  backTo = '/admin/configuracoes',
  rightSlot,
  className,
  breadcrumbs,
  showBreadcrumb = true,
}: SettingsHeaderProps) => {
  const navigate = useNavigate();

  const handleAction = () => {
    if (onAction) return onAction();
    if (action === 'back') navigate(backTo);
  };

  const ActionIcon = action === 'close' ? X : ArrowLeft;
  const ariaLabel = action === 'close' ? 'Fechar' : 'Voltar';

  // Auto-generate a sensible default trail when none was provided.
  const trail: SettingsBreadcrumbItem[] | null = (() => {
    if (!showBreadcrumb) return null;
    if (breadcrumbs && breadcrumbs.length > 0) return breadcrumbs;
    if (typeof title === 'string') {
      return [
        { label: 'Configurações', to: '/admin/configuracoes' },
        { label: title },
      ];
    }
    return null;
  })();

  return (
    <div className={cn('mb-6 space-y-2', className)}>
      {trail && (
        <Breadcrumb>
          <BreadcrumbList>
            {trail.map((item, idx) => {
              const isLast = idx === trail.length - 1;
              return (
                <span key={`${item.label}-${idx}`} className="contents">
                  <BreadcrumbItem>
                    {isLast || !item.to ? (
                      <BreadcrumbPage className="truncate max-w-[12rem] sm:max-w-none">
                        {item.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={item.to}>{item.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </span>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex items-start gap-3">
        {action !== 'none' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAction}
            className="shrink-0 mt-0.5"
            aria-label={ariaLabel}
          >
            <ActionIcon className="w-4 h-4" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            {icon}
            <span className="truncate">{title}</span>
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {rightSlot && <div className="shrink-0 ml-2">{rightSlot}</div>}
      </div>
    </div>
  );
};

export default SettingsHeader;
