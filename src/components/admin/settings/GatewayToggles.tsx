/**
 * Reusable on/off toggles for each payment gateway settings page:
 *  - `<gateway>_enabled` — gateway is operational (can be selected as active OR used as fallback)
 *  - `<gateway>_fallback_enabled` — gateway can be offered as a fallback option after a card rejection
 *
 * Both flags default to TRUE if missing (backward-compatible with existing installations).
 */
import { useEffect, useState } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Power, Shuffle } from 'lucide-react';

export type GatewayKey = 'asaas' | 'mercadopago' | 'pagbank' | 'pagarme';

interface Props {
  gateway: GatewayKey;
  /** Disable the "fallback" toggle for gateways that don't support transparent flow (e.g. PagBank redirect). */
  fallbackSupported?: boolean;
}

const isTrue = (v: string | null | undefined) => v === null || v === undefined || v === '' || v === 'true';

const GatewayToggles = ({ gateway, fallbackSupported = true }: Props) => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const enabledKey = `${gateway}_enabled`;
  const fallbackKey = `${gateway}_fallback_enabled`;

  useEffect(() => {
    Promise.all([fetchSetting(enabledKey), fetchSetting(fallbackKey)]).then(([e, f]) => {
      setEnabled(isTrue(e));
      setFallbackEnabled(isTrue(f));
      setLoaded(true);
    });
  }, [enabledKey, fallbackKey]);

  const persist = async (key: string, value: boolean) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      await upsertSetting(key, value ? 'true' : 'false', user.id);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    }
  };

  const handleEnabledChange = (val: boolean) => {
    setEnabled(val);
    persist(enabledKey, val);
    toast({ title: val ? 'Gateway habilitado' : 'Gateway desabilitado' });
  };

  const handleFallbackChange = (val: boolean) => {
    setFallbackEnabled(val);
    persist(fallbackKey, val);
    toast({ title: val ? 'Adicionado ao fallback' : 'Removido do fallback' });
  };

  if (!loaded) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Power className="w-4 h-4 mt-0.5 text-foreground shrink-0" />
          <div className="min-w-0">
            <Label className="text-sm font-medium">Gateway habilitado</Label>
            <p className="text-xs text-muted-foreground">
              Quando desligado, o gateway não processa cobranças nem aparece como opção de fallback.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={handleEnabledChange} />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Shuffle className="w-4 h-4 mt-0.5 text-foreground shrink-0" />
          <div className="min-w-0">
            <Label className="text-sm font-medium">Apto para fallback de cartão</Label>
            <p className="text-xs text-muted-foreground">
              {fallbackSupported
                ? 'Permite que este gateway apareça como alternativa quando outro recusar o cartão.'
                : 'Indisponível: este gateway usa fluxo de redirect e não pode ser usado como fallback no formulário.'}
            </p>
          </div>
        </div>
        <Switch
          checked={fallbackSupported && fallbackEnabled}
          onCheckedChange={handleFallbackChange}
          disabled={!fallbackSupported || !enabled}
        />
      </div>
    </div>
  );
};

export default GatewayToggles;