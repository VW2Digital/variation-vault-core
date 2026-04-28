import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, CheckCircle2, Loader2, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WebhookUrlCard from '@/components/admin/WebhookUrlCard';
import GatewayToggles from '@/components/admin/settings/GatewayToggles';

interface Props {
  isActive: boolean;
  onActivate: () => void;
}

const PagBankSettings = ({ isActive, onActivate }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [env, setEnv] = useState('sandbox');
  const [showToken, setShowToken] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');

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

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-checkout', {
        body: { action: 'test_connection', environment: env, api_key: token, gateway: 'pagbank' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Conexão OK!', description: `Ambiente: ${env === 'production' ? 'Produção' : 'Sandbox'}` });
    } catch (err: any) {
      toast({ title: 'Falha', description: err.message, variant: 'destructive' });
    } finally { setTesting(false); }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-4">
      <GatewayToggles gateway="pagbank" fallbackSupported={false} />
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
        <Label>Token (Bearer)</Label>
        <div className="relative">
          <Input type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token do painel PagBank" className="pr-10" />
          <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
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
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Salvando...' : (isActive ? 'Salvar' : 'Salvar e Ativar')}
        </Button>
        <Button variant="outline" disabled={testing || !token} onClick={handleTest}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Testar
        </Button>
      </div>
    </div>
  );
};

export default PagBankSettings;
