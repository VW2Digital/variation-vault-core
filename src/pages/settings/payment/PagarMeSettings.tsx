import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PagarMeWebhooksPanel from '@/components/admin/PagarMeWebhooksPanel';

interface Props {
  isActive: boolean;
  onActivate: () => void;
}

const PagarMeSettings = ({ isActive, onActivate }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [env, setEnv] = useState('sandbox');
  const [antifraud, setAntifraud] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  const loadCreds = async (e: string) => {
    const [s, p] = await Promise.all([
      fetchSetting(`pagarme_secret_key_${e}`),
      fetchSetting(`pagarme_public_key_${e}`),
    ]);
    setSecretKey(s || ''); setPublicKey(p || '');
  };

  useEffect(() => {
    Promise.all([
      fetchSetting('pagarme_environment'),
      fetchSetting('pagarme_webhook_secret'),
      fetchSetting('pagarme_antifraud_enabled'),
    ]).then(async ([e, w, af]) => {
      const cur = e || 'sandbox';
      setEnv(cur);
      setWebhookSecret(w || '');
      setAntifraud(af !== 'false');
      await loadCreds(cur);
    }).finally(() => setLoading(false));
  }, []);

  const handleEnvChange = async (newEnv: string) => {
    if (secretKey || publicKey) {
      await Promise.all([
        upsertSetting(`pagarme_secret_key_${env}`, secretKey),
        upsertSetting(`pagarme_public_key_${env}`, publicKey),
      ]);
    }
    setEnv(newEnv);
    await loadCreds(newEnv);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      await Promise.all([
        upsertSetting(`pagarme_secret_key_${env}`, secretKey, user.id),
        upsertSetting(`pagarme_public_key_${env}`, publicKey, user.id),
        upsertSetting('pagarme_secret_key', secretKey, user.id),
        upsertSetting('pagarme_public_key', publicKey, user.id),
        upsertSetting('pagarme_environment', env, user.id),
        upsertSetting('pagarme_webhook_secret', webhookSecret, user.id),
        upsertSetting('pagarme_antifraud_enabled', antifraud ? 'true' : 'false', user.id),
      ]);
      if (!isActive) {
        await upsertSetting('payment_gateway', 'pagarme', user.id);
        onActivate();
      }
      toast({ title: 'Pagar.me salvo!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-checkout', {
        body: { action: 'test_connection', environment: env, api_key: secretKey, gateway: 'pagarme' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Conexão OK!', description: `Ambiente: ${env === 'production' ? 'Produção' : 'Sandbox'}` });
    } catch (err: any) {
      toast({ title: 'Falha', description: err.message, variant: 'destructive' });
    } finally { setTesting(false); }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Ambiente</Label>
        <Select value={env} onValueChange={handleEnvChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
            <SelectItem value="production">Produção</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Secret Key (sk_)</Label>
        <div className="relative">
          <Input type={showSecret ? 'text' : 'password'} value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={env === 'sandbox' ? 'sk_test_...' : 'sk_...'} className="pr-10" />
          <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Usada no servidor para criar pedidos.</p>
      </div>
      <div className="space-y-2">
        <Label>Public Key (pk_)</Label>
        <Input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder={env === 'sandbox' ? 'pk_test_...' : 'pk_...'} />
        <p className="text-xs text-muted-foreground">Usada para tokenização do cartão no navegador.</p>
      </div>
      <div className="space-y-2">
        <Label>Webhook Secret (HMAC-SHA1)</Label>
        <div className="relative">
          <Input type={showWebhook ? 'text' : 'password'} value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Segredo do painel Pagar.me" className="pr-10" />
          <button type="button" onClick={() => setShowWebhook(!showWebhook)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showWebhook ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
        <div>
          <Label className="text-sm">Antifraude</Label>
          <p className="text-xs text-muted-foreground">Análise antifraude nos pedidos com cartão.</p>
        </div>
        <Switch checked={antifraud} onCheckedChange={setAntifraud} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">URL do Webhook</Label>
        <Input readOnly value="https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/pagarme-webhook" className="bg-muted text-xs" onClick={(e) => {
          (e.target as HTMLInputElement).select();
          navigator.clipboard.writeText("https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/pagarme-webhook");
          toast({ title: 'URL copiada!' });
        }} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Salvando...' : (isActive ? 'Salvar' : 'Salvar e Ativar')}
        </Button>
        <Button variant="outline" disabled={testing || !secretKey} onClick={handleTest}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Testar
        </Button>
      </div>
    </div>
  );
};

export default PagarMeSettings;
