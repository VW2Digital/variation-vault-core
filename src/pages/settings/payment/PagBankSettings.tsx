import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import WebhookUrlCard from '@/components/admin/WebhookUrlCard';
import GatewayToggles from '@/components/admin/settings/GatewayToggles';
import EnvironmentSelect from '@/components/admin/settings/payment/EnvironmentSelect';
import PasswordField from '@/components/admin/settings/payment/PasswordField';
import SaveTestButtons from '@/components/admin/settings/payment/SaveTestButtons';
import { useGatewayConnectionTest } from '@/components/admin/settings/payment/useGatewayConnectionTest';

interface Props { isActive: boolean; onActivate: () => void }

const PagBankSettings = ({ isActive, onActivate }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [env, setEnv] = useState('sandbox');
  const [redirectUrl, setRedirectUrl] = useState('');
  const { testing, test } = useGatewayConnectionTest('pagbank');

  const loadCreds = async (e: string) => {
    const [t, p, publicUrl] = await Promise.all([
      fetchSetting(`pagbank_token_${e}`),
      fetchSetting(`pagbank_public_key_${e}`),
      fetchSetting('store_public_url'),
    ]);
    setToken(t || ''); setPublicKey(p || ''); setRedirectUrl(publicUrl || `${window.location.origin}/minha-conta`);
  };

  useEffect(() => {
    fetchSetting('pagbank_environment').then(async (e) => {
      const cur = e || 'sandbox';
      setEnv(cur);
      await loadCreds(cur);
    }).finally(() => setLoading(false));
  }, []);

  const handleEnvChange = async (newEnv: string) => {
    if (token || publicKey) {
      await Promise.all([
        upsertSetting(`pagbank_token_${env}`, token),
        upsertSetting(`pagbank_public_key_${env}`, publicKey),
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
        upsertSetting(`pagbank_token_${env}`, token, user.id),
        upsertSetting(`pagbank_public_key_${env}`, publicKey, user.id),
        upsertSetting('pagbank_token', token, user.id),
        upsertSetting('pagbank_public_key', publicKey, user.id),
        upsertSetting('pagbank_environment', env, user.id),
      ]);
      if (!isActive) {
        await upsertSetting('payment_gateway', 'pagbank', user.id);
        onActivate();
      }
      toast({ title: 'PagBank salvo!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleGenerateKey = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-checkout', {
        body: { action: 'generate_pagbank_public_key', token, environment: env },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.public_key) {
        setPublicKey(data.public_key);
        toast({ title: 'Public Key gerada!' });
      } else throw new Error('Resposta sem public_key');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setGenerating(false); }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-4">
      <GatewayToggles gateway="pagbank" fallbackSupported={false} />
      <EnvironmentSelect value={env} onChange={handleEnvChange} />
      <PasswordField label="Token (Bearer)" value={token} onChange={setToken} placeholder="Token do painel PagBank" />
      <div className="space-y-2">
        <Label>Public Key (Criptografia de Cartão)</Label>
        <div className="flex gap-2">
          <Input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="MIIBIjANBgkqhki..." className="flex-1" />
          <Button variant="outline" size="sm" disabled={generating || !token} onClick={handleGenerateKey} className="whitespace-nowrap">
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <KeyRound className="w-4 h-4 mr-1" />}
            Gerar
          </Button>
        </div>
      </div>
      <WebhookUrlCard
        gatewayName="PagBank"
        functionSlug="pagbank-webhook"
        cadastroHint="no painel do PagBank, em Aplicações → Notificações"
        eventos={["CHECKOUT.PAID", "CHECKOUT.CANCELED", "ORDER.PAID"]}
      />
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">URL de Redirecionamento</Label>
        <Input readOnly value={redirectUrl} className="bg-muted text-xs" onClick={(e) => {
          (e.target as HTMLInputElement).select();
          navigator.clipboard.writeText(redirectUrl);
          toast({ title: 'URL copiada!' });
        }} />
      </div>
      <SaveTestButtons
        isActive={isActive}
        saving={saving}
        testing={testing}
        testDisabled={!token}
        onSave={handleSave}
        onTest={() => test(token, env)}
      />
    </div>
  );
};

export default PagBankSettings;
