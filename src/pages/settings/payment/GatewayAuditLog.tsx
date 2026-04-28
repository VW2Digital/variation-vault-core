/**
 * Auditoria de alterações nos toggles dos gateways de pagamento.
 * Lê de `gateway_settings_audit` (apenas admins têm acesso via RLS).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, RefreshCw, Power, Shuffle, ArrowRight } from 'lucide-react';
import SettingsBackButton from '../SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';

interface AuditEntry {
  id: string;
  user_email: string | null;
  gateway: string;
  setting_type: 'enabled' | 'fallback_enabled' | string;
  old_value: boolean | null;
  new_value: boolean;
  created_at: string;
}

const GATEWAY_LABEL: Record<string, string> = {
  asaas: 'Asaas',
  mercadopago: 'Mercado Pago',
  pagbank: 'PagBank',
  pagarme: 'Pagar.me',
};

const SETTING_LABEL: Record<string, string> = {
  enabled: 'Gateway habilitado',
  fallback_enabled: 'Apto para fallback',
};

const GatewayAuditLog = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('gateway_settings_audit' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && data) setEntries(data as unknown as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton
        title="Auditoria de Gateways"
        description="Histórico de habilitação/desabilitação e alterações de fallback dos gateways de pagamento."
      />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma alteração registrada ainda.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => {
            const Icon = e.setting_type === 'fallback_enabled' ? Shuffle : Power;
            const isOn = e.new_value === true;
            return (
              <Card key={e.id} className="p-3 flex items-center gap-3 flex-wrap">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">{GATEWAY_LABEL[e.gateway] ?? e.gateway}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{SETTING_LABEL[e.setting_type] ?? e.setting_type}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-5">{e.old_value === null ? '—' : e.old_value ? 'ON' : 'OFF'}</Badge>
                    <ArrowRight className="w-3 h-3" />
                    <Badge variant={isOn ? 'default' : 'destructive'} className="h-5">{isOn ? 'ON' : 'OFF'}</Badge>
                    <span className="ml-2">{e.user_email ?? 'usuário desconhecido'}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString('pt-BR')}
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GatewayAuditLog;