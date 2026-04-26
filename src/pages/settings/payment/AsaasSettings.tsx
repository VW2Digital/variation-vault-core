import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WebhookUrlCard from '@/components/admin/WebhookUrlCard';

interface Props {
  isActive: boolean;
  onActivate: () => void;
}

const AsaasSettings = ({ isActive, onActivate }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [env, setEnv] = useState('sandbox');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSetting('asaas_api_key'),
      fetchSetting('asaas_environment'),
      fetchSetting('asaas_webhook_token'),
    ]).then(([k, e, w]) => {
      setApiKey(k || '');
      setEnv(e || 'sandbox');
      setWebhookToken(w || '');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      await Promise.all([
        upsertSetting('asaas_api_key', apiKey, user.id),
        upsertSetting('asaas_environment', env, user.id),
        upsertSetting('asaas_webhook_token', webhookToken, user.id),
        ...(isActive ? [] : []),
      ]);
      if (!isActive) {
        await upsertSetting('payment_gateway', 'asaas', user.id);
        onActivate();
      }
      toast({ title: 'Asaas salvo!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-checkout', {
        body: { action: 'test_connection', environment: env, api_key: apiKey },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Conexão OK!', description: `Ambiente: ${env === 'production' ? 'Produção' : 'Sandbox'}` });
    } catch (err: any) {
      toast({ title: 'Falha na conexão', description: err.message, variant: 'destructive' });
    } finally { setTesting(false); }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Ambiente</Label>
        <Select value={env} onValueChange={setEnv}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
            <SelectItem value="production">Produção</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>API Key</Label>
        <div className="relative">
          <Input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="$aact_..." className="pr-10" />
          <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Token de Autenticação do Webhook</Label>
        <div className="relative">
          <Input type={showWebhookToken ? 'text' : 'password'} value={webhookToken} onChange={(e) => setWebhookToken(e.target.value)} placeholder="Token definido no Asaas" className="pr-10" />
          <button type="button" onClick={() => setShowWebhookToken(!showWebhookToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showWebhookToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <WebhookUrlCard
        gatewayName="Asaas"
        functionSlug="asaas-webhook"
        cadastroHint="no painel do Asaas, em Integrações → Webhooks"
        eventos={["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED"]}
      />
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Salvando...' : (isActive ? 'Salvar' : 'Salvar e Ativar')}
        </Button>
        <Button variant="outline" disabled={testing || !apiKey} onClick={handleTest}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Testar
        </Button>
      </div>
    </div>
  );
};

export default AsaasSettings;
