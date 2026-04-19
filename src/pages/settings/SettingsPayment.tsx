import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Eye, EyeOff, CheckCircle2, Loader2, KeyRound } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsBackButton from './SettingsBackButton';

const SettingsPayment = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Asaas
  const [asaasApiKey, setAsaasApiKey] = useState('');
  const [asaasWebhookToken, setAsaasWebhookToken] = useState('');
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [asaasEnv, setAsaasEnv] = useState('sandbox');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingAsaas, setTestingAsaas] = useState(false);
  const [testingPb, setTestingPb] = useState(false);

  // Gateway
  const [paymentGateway, setPaymentGateway] = useState('asaas');
  const [asaasEnabled, setAsaasEnabled] = useState(true);
  const [mpEnabled, setMpEnabled] = useState(false);
  const [pbEnabled, setPbEnabled] = useState(false);
  const [pgmeEnabled, setPgmeEnabled] = useState(false);

  // Mercado Pago
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpClientId, setMpClientId] = useState('');
  const [mpClientSecret, setMpClientSecret] = useState('');
  const [mpEnvironment, setMpEnvironment] = useState('sandbox');
  const [mpCheckoutMode, setMpCheckoutMode] = useState<'transparent' | 'redirect'>('transparent');
  const [showMpToken, setShowMpToken] = useState(false);
  const [showMpClientSecret, setShowMpClientSecret] = useState(false);

  // PagBank
  const [pbToken, setPbToken] = useState('');
  const [pbPublicKey, setPbPublicKey] = useState('');
  const [pbEnvironment, setPbEnvironment] = useState('sandbox');
  const [showPbToken, setShowPbToken] = useState(false);
  const [generatingPbKey, setGeneratingPbKey] = useState(false);

  // Pagar.me
  const [pgmeSecretKey, setPgmeSecretKey] = useState('');
  const [pgmePublicKey, setPgmePublicKey] = useState('');
  const [pgmeWebhookSecret, setPgmeWebhookSecret] = useState('');
  const [pgmeEnvironment, setPgmeEnvironment] = useState('sandbox');
  const [pgmeAntifraudEnabled, setPgmeAntifraudEnabled] = useState(true);
  const [showPgmeSecretKey, setShowPgmeSecretKey] = useState(false);
  const [showPgmeWebhookSecret, setShowPgmeWebhookSecret] = useState(false);
  const [testingPgme, setTestingPgme] = useState(false);

  const loadPgmeCredentials = async (env: string) => {
    const [secret, pubKey] = await Promise.all([
      fetchSetting(`pagarme_secret_key_${env}`),
      fetchSetting(`pagarme_public_key_${env}`),
    ]);
    setPgmeSecretKey(secret || '');
    setPgmePublicKey(pubKey || '');
  };

  const handlePgmeEnvChange = async (newEnv: string) => {
    const oldEnv = pgmeEnvironment;
    if (pgmeSecretKey || pgmePublicKey) {
      await Promise.all([
        upsertSetting(`pagarme_secret_key_${oldEnv}`, pgmeSecretKey),
        upsertSetting(`pagarme_public_key_${oldEnv}`, pgmePublicKey),
      ]);
    }
    setPgmeEnvironment(newEnv);
    await loadPgmeCredentials(newEnv);
  };

  const loadPbCredentials = async (env: string) => {
    const [token, pubKey] = await Promise.all([
      fetchSetting(`pagbank_token_${env}`),
      fetchSetting(`pagbank_public_key_${env}`),
    ]);
    setPbToken(token || '');
    setPbPublicKey(pubKey || '');
  };

  const handlePbEnvChange = async (newEnv: string) => {
    const oldEnv = pbEnvironment;
    if (pbToken || pbPublicKey) {
      await Promise.all([
        upsertSetting(`pagbank_token_${oldEnv}`, pbToken),
        upsertSetting(`pagbank_public_key_${oldEnv}`, pbPublicKey),
      ]);
    }
    setPbEnvironment(newEnv);
    await loadPbCredentials(newEnv);
  };

  const loadMpCredentials = async (env: string) => {
    const [token, pubKey, clientId, clientSecret] = await Promise.all([
      fetchSetting(`mercadopago_access_token_${env}`),
      fetchSetting(`mercadopago_public_key_${env}`),
      fetchSetting(`mercadopago_client_id_${env}`),
      fetchSetting(`mercadopago_client_secret_${env}`),
    ]);
    setMpAccessToken(token || '');
    setMpPublicKey(pubKey || '');
    setMpClientId(clientId || '');
    setMpClientSecret(clientSecret || '');
  };

  const handleMpEnvChange = async (newEnv: string) => {
    const oldEnv = mpEnvironment;
    if (mpAccessToken || mpPublicKey || mpClientId || mpClientSecret) {
      await Promise.all([
        upsertSetting(`mercadopago_access_token_${oldEnv}`, mpAccessToken),
        upsertSetting(`mercadopago_public_key_${oldEnv}`, mpPublicKey),
        upsertSetting(`mercadopago_client_id_${oldEnv}`, mpClientId),
        upsertSetting(`mercadopago_client_secret_${oldEnv}`, mpClientSecret),
      ]);
    }
    setMpEnvironment(newEnv);
    await loadMpCredentials(newEnv);
  };

  useEffect(() => {
    Promise.all([
      fetchSetting('asaas_api_key'),
      fetchSetting('asaas_environment'),
      fetchSetting('asaas_webhook_token'),
      fetchSetting('payment_gateway'),
      fetchSetting('mercadopago_environment'),
      fetchSetting('pagbank_environment'),
      fetchSetting('mercadopago_checkout_mode'),
    ]).then(async ([apiKey, env, webhookToken, pgw, mpEnv, pbEnv, mpMode]) => {
      setAsaasApiKey(apiKey || '');
      setAsaasEnv(env || 'sandbox');
      setAsaasWebhookToken(webhookToken || '');
      const activeGw = pgw || 'asaas';
      setPaymentGateway(activeGw);
      setAsaasEnabled(activeGw === 'asaas');
      setMpEnabled(activeGw === 'mercadopago');
      setPbEnabled(activeGw === 'pagbank');
      const currentMpEnv = mpEnv || 'sandbox';
      setMpEnvironment(currentMpEnv);
      setMpCheckoutMode(mpMode === 'redirect' ? 'redirect' : 'transparent');
      await loadMpCredentials(currentMpEnv);
      const currentPbEnv = pbEnv || 'sandbox';
      setPbEnvironment(currentPbEnv);
      await loadPbCredentials(currentPbEnv);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const uid = user.id;
      await Promise.all([
        upsertSetting('asaas_api_key', asaasApiKey, uid),
        upsertSetting('asaas_environment', asaasEnv, uid),
        upsertSetting('asaas_webhook_token', asaasWebhookToken, uid),
        upsertSetting('payment_gateway', paymentGateway, uid),
        upsertSetting('mercadopago_environment', mpEnvironment, uid),
        upsertSetting(`mercadopago_access_token_${mpEnvironment}`, mpAccessToken, uid),
        upsertSetting(`mercadopago_public_key_${mpEnvironment}`, mpPublicKey, uid),
        upsertSetting(`mercadopago_client_id_${mpEnvironment}`, mpClientId, uid),
        upsertSetting(`mercadopago_client_secret_${mpEnvironment}`, mpClientSecret, uid),
        upsertSetting('mercadopago_access_token', mpAccessToken, uid),
        upsertSetting('mercadopago_public_key', mpPublicKey, uid),
        upsertSetting('mercadopago_checkout_mode', mpCheckoutMode, uid),
        upsertSetting(`pagbank_token_${pbEnvironment}`, pbToken, uid),
        upsertSetting(`pagbank_public_key_${pbEnvironment}`, pbPublicKey, uid),
        upsertSetting('pagbank_token', pbToken, uid),
        upsertSetting('pagbank_public_key', pbPublicKey, uid),
        upsertSetting('pagbank_environment', pbEnvironment, uid),
      ]);
      toast({ title: 'Configurações de pagamento salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Gateways de Pagamento" description="Asaas, Mercado Pago, PagBank, parcelamento e descontos PIX" />

      {/* Asaas */}
      <Card className={`border-border/50 ${asaasEnabled ? 'border-2 border-primary/30' : 'opacity-60'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Asaas - Checkout Transparente
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{asaasEnabled ? 'Ativo' : 'Inativo'}</span>
              <Switch checked={asaasEnabled} onCheckedChange={(checked) => {
                setAsaasEnabled(checked);
                if (checked) { setMpEnabled(false); setPbEnabled(false); setPaymentGateway('asaas'); }
                else if (!mpEnabled && !pbEnabled) { setMpEnabled(true); setPaymentGateway('mercadopago'); }
              }} />
            </div>
          </div>
        </CardHeader>
        {asaasEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select value={asaasEnv} onValueChange={setAsaasEnv}>
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
                <Input type={showApiKey ? 'text' : 'password'} value={asaasApiKey} onChange={(e) => setAsaasApiKey(e.target.value)} placeholder="$aact_..." className="pr-10" />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Token de Autenticação do Webhook</Label>
              <div className="relative">
                <Input type={showWebhookToken ? 'text' : 'password'} value={asaasWebhookToken} onChange={(e) => setAsaasWebhookToken(e.target.value)} placeholder="Token definido no Asaas" className="pr-10" />
                <button type="button" onClick={() => setShowWebhookToken(!showWebhookToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showWebhookToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL do Webhook (copie para o Asaas)</Label>
              <Input readOnly value="https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/asaas-webhook" className="bg-muted text-xs" onClick={(e) => {
                (e.target as HTMLInputElement).select();
                navigator.clipboard.writeText("https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/asaas-webhook");
                toast({ title: 'URL copiada!' });
              }} />
            </div>
            <Button variant="outline" size="sm" disabled={testingAsaas || !asaasApiKey} onClick={async () => {
              setTestingAsaas(true);
              try {
                const { data, error } = await supabase.functions.invoke('payment-checkout', {
                  body: { action: 'test_connection', environment: asaasEnv, api_key: asaasApiKey },
                });
                if (error) throw new Error(error.message);
                if (data?.error) throw new Error(data.error);
                toast({ title: '✅ Conexão com Asaas OK!', description: `Ambiente: ${asaasEnv === 'production' ? 'Produção' : 'Sandbox'}` });
              } catch (err: any) {
                toast({ title: 'Falha na conexão', description: err.message, variant: 'destructive' });
              } finally { setTestingAsaas(false); }
            }}>
              {testingAsaas ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Testar Conexão
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Mercado Pago */}
      <Card className={`border-border/50 ${mpEnabled ? 'border-2 border-primary/30' : 'opacity-60'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Mercado Pago
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{mpEnabled ? 'Ativo' : 'Inativo'}</span>
              <Switch checked={mpEnabled} onCheckedChange={(checked) => {
                setMpEnabled(checked);
                if (checked) { setAsaasEnabled(false); setPbEnabled(false); setPaymentGateway('mercadopago'); }
                else if (!asaasEnabled && !pbEnabled) { setAsaasEnabled(true); setPaymentGateway('asaas'); }
              }} />
            </div>
          </div>
        </CardHeader>
        {mpEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select value={mpEnvironment} onValueChange={handleMpEnvChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modo de Checkout</Label>
              <Select value={mpCheckoutMode} onValueChange={(v) => setMpCheckoutMode(v as 'transparent' | 'redirect')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transparent">Transparente (PIX + Cartão na loja)</SelectItem>
                  <SelectItem value="redirect">Redirect (Checkout Pro do Mercado Pago)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mpCheckoutMode === 'transparent'
                  ? 'O cliente paga direto na sua loja, sem sair do site.'
                  : 'O cliente é redirecionado para o Mercado Pago para pagar.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Access Token</Label>
              <div className="relative">
                <Input type={showMpToken ? 'text' : 'password'} value={mpAccessToken} onChange={(e) => setMpAccessToken(e.target.value)} placeholder={mpEnvironment === 'sandbox' ? 'TEST-...' : 'APP_USR-...'} className="pr-10" />
                <button type="button" onClick={() => setShowMpToken(!showMpToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showMpToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Public Key</Label>
              <Input value={mpPublicKey} onChange={(e) => setMpPublicKey(e.target.value)} placeholder={mpEnvironment === 'sandbox' ? 'TEST-...' : 'APP_USR-...'} />
            </div>
            <div className="space-y-2">
              <Label>Client ID</Label>
              <Input value={mpClientId} onChange={(e) => setMpClientId(e.target.value)} placeholder="Ex: 3427228834545577" />
            </div>
            <div className="space-y-2">
              <Label>Client Secret</Label>
              <div className="relative">
                <Input type={showMpClientSecret ? 'text' : 'password'} value={mpClientSecret} onChange={(e) => setMpClientSecret(e.target.value)} placeholder="Ex: gCED4b..." className="pr-10" />
                <button type="button" onClick={() => setShowMpClientSecret(!showMpClientSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showMpClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL do Webhook (copie para o Mercado Pago)</Label>
              <Input readOnly value="https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/mercadopago-webhook" className="bg-muted text-xs" onClick={(e) => {
                (e.target as HTMLInputElement).select();
                navigator.clipboard.writeText("https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/mercadopago-webhook");
                toast({ title: 'URL copiada!' });
              }} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* PagBank */}
      <Card className={`border-border/50 ${pbEnabled ? 'border-2 border-primary/30' : 'opacity-60'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> PagBank (PagSeguro)
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{pbEnabled ? 'Ativo' : 'Inativo'}</span>
              <Switch checked={pbEnabled} onCheckedChange={(checked) => {
                setPbEnabled(checked);
                if (checked) { setAsaasEnabled(false); setMpEnabled(false); setPaymentGateway('pagbank'); }
                else if (!asaasEnabled && !mpEnabled) { setAsaasEnabled(true); setPaymentGateway('asaas'); }
              }} />
            </div>
          </div>
        </CardHeader>
        {pbEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select value={pbEnvironment} onValueChange={handlePbEnvChange}>
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
                <Input type={showPbToken ? 'text' : 'password'} value={pbToken} onChange={(e) => setPbToken(e.target.value)} placeholder="Token obtido no painel PagBank" className="pr-10" />
                <button type="button" onClick={() => setShowPbToken(!showPbToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPbToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Public Key (Criptografia de Cartão)</Label>
              <div className="flex gap-2">
                <Input value={pbPublicKey} onChange={(e) => setPbPublicKey(e.target.value)} placeholder="MIIBIjANBgkqhki..." className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={generatingPbKey || !pbToken}
                  onClick={async () => {
                    setGeneratingPbKey(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('payment-checkout', {
                        body: {
                          action: 'generate_pagbank_public_key',
                          token: pbToken,
                          environment: pbEnvironment,
                        },
                      });
                      if (error) throw new Error(error.message);
                      if (data?.error) throw new Error(data.error);
                      if (data?.public_key) {
                        setPbPublicKey(data.public_key);
                        toast({ title: 'Public Key gerada com sucesso!' });
                      } else {
                        throw new Error('Resposta sem public_key');
                      }
                    } catch (err: any) {
                      toast({ title: 'Erro ao gerar Public Key', description: err.message, variant: 'destructive' });
                    } finally {
                      setGeneratingPbKey(false);
                    }
                  }}
                  className="whitespace-nowrap"
                >
                  {generatingPbKey ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <KeyRound className="w-4 h-4 mr-1" />}
                  Gerar Key
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL do Webhook (copie para o PagBank)</Label>
              <Input readOnly value="https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/pagbank-webhook" className="bg-muted text-xs" onClick={(e) => {
                (e.target as HTMLInputElement).select();
                navigator.clipboard.writeText("https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/pagbank-webhook");
                toast({ title: 'URL copiada!' });
              }} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL de Redirecionamento (copie para o PagBank)</Label>
              <Input readOnly value="https://variation-vault-core.lovable.app/minha-conta" className="bg-muted text-xs" onClick={(e) => {
                (e.target as HTMLInputElement).select();
                navigator.clipboard.writeText("https://variation-vault-core.lovable.app/minha-conta");
                toast({ title: 'URL copiada!' });
              }} />
            </div>
            <Button variant="outline" size="sm" disabled={testingPb || !pbToken} onClick={async () => {
              setTestingPb(true);
              try {
                const { data, error } = await supabase.functions.invoke('payment-checkout', {
                  body: { action: 'test_connection', environment: pbEnvironment, api_key: pbToken, gateway: 'pagbank' },
                });
                if (error) throw new Error(error.message);
                if (data?.error) throw new Error(data.error);
                toast({ title: 'Conexao com PagBank OK!', description: `Ambiente: ${pbEnvironment === 'production' ? 'Producao' : 'Sandbox'}` });
              } catch (err: any) {
                toast({ title: 'Falha na conexao', description: err.message, variant: 'destructive' });
              } finally { setTestingPb(false); }
            }}>
              {testingPb ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Testar Conexao
            </Button>
          </CardContent>
        )}
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsPayment;
