import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
}: SettingsHeaderProps) => {
  const navigate = useNavigate();

  const handleAction = () => {
    if (onAction) return onAction();
    if (action === 'back') navigate(backTo);
  };

  const ActionIcon = action === 'close' ? X : ArrowLeft;
  const ariaLabel = action === 'close' ? 'Fechar' : 'Voltar';

  return (
    <div className={cn('flex items-start gap-3 mb-6', className)}>
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
  );
};

export default SettingsHeader;