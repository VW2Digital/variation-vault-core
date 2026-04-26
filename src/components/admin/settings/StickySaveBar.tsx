import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StickySaveBarProps {
  visible: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  message?: string;
  saveLabel?: string;
}

/**
 * Sticky bottom bar shown only when the form has unsaved changes.
 * Lives at the bottom of the viewport (fixed) so the admin never has
 * to scroll back up to save.
 */
const StickySaveBar = ({
  visible,
  saving = false,
  onSave,
  onDiscard,
  message = 'Você tem alterações não salvas',
  saveLabel = 'Salvar alterações',
}: StickySaveBarProps) => {
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 transition-transform duration-200 ease-out pointer-events-none',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
      aria-hidden={!visible}
    >
      <div className="mx-auto max-w-5xl px-4 pb-4 pointer-events-auto">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card shadow-lg px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <p className="text-sm text-foreground truncate">{message}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onDiscard && (
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
                Descartar
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saveLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StickySaveBar;