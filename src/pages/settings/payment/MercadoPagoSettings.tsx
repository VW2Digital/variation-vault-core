import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import WebhookUrlCard from '@/components/admin/WebhookUrlCard';
import GatewayToggles from '@/components/admin/settings/GatewayToggles';
import EnvironmentSelect from '@/components/admin/settings/payment/EnvironmentSelect';
import PasswordField from '@/components/admin/settings/payment/PasswordField';
import TextField from '@/components/admin/settings/payment/TextField';

interface Props { isActive: boolean; onActivate: () => void }

const MercadoPagoSettings = ({ isActive, onActivate }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [env, setEnv] = useState('sandbox');
  const [mode, setMode] = useState<'transparent' | 'redirect'>('transparent');

  const loadCreds = async (e: string) => {
    const [t, p, c, s] = await Promise.all([
      fetchSetting(`mercadopago_access_token_${e}`),
      fetchSetting(`mercadopago_public_key_${e}`),
      fetchSetting(`mercadopago_client_id_${e}`),
      fetchSetting(`mercadopago_client_secret_${e}`),
    ]);
    setAccessToken(t || ''); setPublicKey(p || ''); setClientId(c || ''); setClientSecret(s || '');
  };

  useEffect(() => {
    Promise.all([
      fetchSetting('mercadopago_environment'),
      fetchSetting('mercadopago_checkout_mode'),
    ]).then(async ([e, m]) => {
      const cur = e || 'sandbox';
      setEnv(cur);
      setMode(m === 'redirect' ? 'redirect' : 'transparent');
      await loadCreds(cur);
    }).finally(() => setLoading(false));
  }, []);

  const handleEnvChange = async (newEnv: string) => {
    if (accessToken || publicKey || clientId || clientSecret) {
      await Promise.all([
        upsertSetting(`mercadopago_access_token_${env}`, accessToken),
        upsertSetting(`mercadopago_public_key_${env}`, publicKey),
        upsertSetting(`mercadopago_client_id_${env}`, clientId),
        upsertSetting(`mercadopago_client_secret_${env}`, clientSecret),
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
        upsertSetting('mercadopago_environment', env, user.id),
        upsertSetting(`mercadopago_access_token_${env}`, accessToken, user.id),
        upsertSetting(`mercadopago_public_key_${env}`, publicKey, user.id),
        upsertSetting(`mercadopago_client_id_${env}`, clientId, user.id),
        upsertSetting(`mercadopago_client_secret_${env}`, clientSecret, user.id),
        upsertSetting('mercadopago_access_token', accessToken, user.id),
        upsertSetting('mercadopago_public_key', publicKey, user.id),
        upsertSetting('mercadopago_checkout_mode', mode, user.id),
      ]);
      if (!isActive) {
        await upsertSetting('payment_gateway', 'mercadopago', user.id);
        onActivate();
      }
      toast({ title: 'Mercado Pago salvo!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-4">
      <GatewayToggles gateway="mercadopago" />
      <GatewayAccountList gateway="mercadopago" />
      <EnvironmentSelect value={env} onChange={handleEnvChange} />
      <div className="space-y-2">
        <Label>Modo de Checkout</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="transparent">Transparente (PIX + Cartão na loja)</SelectItem>
            <SelectItem value="redirect">Redirect (Checkout Pro)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mode === 'transparent' ? 'O cliente paga direto na sua loja, sem sair do site.' : 'O cliente é redirecionado para o Mercado Pago.'}
        </p>
      </div>
      <PasswordField
        label="Access Token"
        value={accessToken}
        onChange={setAccessToken}
        placeholder={env === 'sandbox' ? 'TEST-...' : 'APP_USR-...'}
      />
      <TextField
        label="Public Key"
        value={publicKey}
        onChange={setPublicKey}
        placeholder={env === 'sandbox' ? 'TEST-...' : 'APP_USR-...'}
      />
      <TextField
        label="Client ID"
        value={clientId}
        onChange={setClientId}
        placeholder="Ex: 3427228834545577"
      />
      <PasswordField label="Client Secret" value={clientSecret} onChange={setClientSecret} placeholder="Ex: gCED4b..." />
      <WebhookUrlCard
        gatewayName="Mercado Pago"
        functionSlug="mercadopago-webhook"
        cadastroHint="no painel do Mercado Pago, em Suas integrações → Notificações → Webhooks"
        eventos={["payment", "merchant_order"]}
      />
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? 'Salvando...' : (isActive ? 'Salvar' : 'Salvar e Ativar')}
      </Button>
    </div>
  );
};

export default MercadoPagoSettings;
