import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  isActive: boolean;
  saving: boolean;
  testing?: boolean;
  testDisabled?: boolean;
  onSave: () => void;
  onTest?: () => void;
}

/** Save (+ optional Test) action row used by every gateway settings page. */
const SaveTestButtons = ({ isActive, saving, testing, testDisabled, onSave, onTest }: Props) => (
  <div className="flex gap-2 pt-2">
    <Button onClick={onSave} disabled={saving} className="flex-1">
      {saving ? 'Salvando...' : (isActive ? 'Salvar' : 'Salvar e Ativar')}
    </Button>
    {onTest ? (
      <Button variant="outline" disabled={testing || testDisabled} onClick={onTest}>
        {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
        Testar
      </Button>
    ) : null}
  </div>
);

export default SaveTestButtons;