import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import PagarMeWebhooksPanel from '@/components/admin/PagarMeWebhooksPanel';
import WebhookUrlCard from '@/components/admin/WebhookUrlCard';
import GatewayToggles from '@/components/admin/settings/GatewayToggles';
import EnvironmentSelect from '@/components/admin/settings/payment/EnvironmentSelect';
import PasswordField from '@/components/admin/settings/payment/PasswordField';
import TextField from '@/components/admin/settings/payment/TextField';
import SwitchRow from '@/components/admin/settings/payment/SwitchRow';
import SaveTestButtons from '@/components/admin/settings/payment/SaveTestButtons';
import { useGatewayConnectionTest } from '@/components/admin/settings/payment/useGatewayConnectionTest';

interface Props { isActive: boolean; onActivate: () => void }

const PagarMeSettings = ({ isActive, onActivate }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [env, setEnv] = useState('sandbox');
  const [antifraud, setAntifraud] = useState(true);
  const { testing, test } = useGatewayConnectionTest('pagarme');

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

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-4">
      <GatewayToggles gateway="pagarme" />
      <EnvironmentSelect value={env} onChange={handleEnvChange} />
      <PasswordField
        label="Secret Key (sk_)"
        value={secretKey}
        onChange={setSecretKey}
        placeholder={env === 'sandbox' ? 'sk_test_...' : 'sk_...'}
        hint="Usada no servidor para criar pedidos."
      />
      <TextField
        label="Public Key (pk_)"
        value={publicKey}
        onChange={setPublicKey}
        placeholder={env === 'sandbox' ? 'pk_test_...' : 'pk_...'}
        hint="Usada para tokenização do cartão no navegador."
      />
      <PasswordField label="Webhook Secret (HMAC-SHA1)" value={webhookSecret} onChange={setWebhookSecret} placeholder="Segredo do painel Pagar.me" />
      <SwitchRow
        label="Antifraude"
        description="Análise antifraude nos pedidos com cartão."
        checked={antifraud}
        onCheckedChange={setAntifraud}
      />
      <WebhookUrlCard
        gatewayName="Pagar.me"
        functionSlug="pagarme-webhook"
        cadastroHint="no painel da Pagar.me, em Configurações → Webhooks (assinatura HMAC-SHA1)"
        eventos={["order.paid", "order.payment_failed", "charge.paid", "charge.refunded"]}
      />
      <SaveTestButtons
        isActive={isActive}
        saving={saving}
        testing={testing}
        testDisabled={!secretKey}
        onSave={handleSave}
        onTest={() => test(secretKey, env)}
      />

      {isActive && secretKey ? (
        <div className="pt-2">
          <PagarMeWebhooksPanel />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Salve e ative a Pagar.me com uma Secret Key válida para acessar o diagnóstico de webhooks.
        </p>
      )}
    </div>
  );
};

export default PagarMeSettings;
