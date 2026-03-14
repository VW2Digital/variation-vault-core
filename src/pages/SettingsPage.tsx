import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Phone, CreditCard, Eye, EyeOff, Truck, MapPin, Mail, Link2, CheckCircle2, Download, Loader2, MessageSquare, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SettingsPage = () => {
  const { toast } = useToast();
  const [whatsapp, setWhatsapp] = useState('');
  const [asaasApiKey, setAsaasApiKey] = useState('');
  const [asaasWebhookToken, setAsaasWebhookToken] = useState('');
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [asaasEnv, setAsaasEnv] = useState('sandbox');
  const [melhorEnvioToken, setMelhorEnvioToken] = useState('');
  const [melhorEnvioClientId, setMelhorEnvioClientId] = useState('');
  const [melhorEnvioClientSecret, setMelhorEnvioClientSecret] = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [melhorEnvioEnv, setMelhorEnvioEnv] = useState('sandbox');
  const [melhorEnvioTokenExpires, setMelhorEnvioTokenExpires] = useState('');
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showMelhorEnvioToken, setShowMelhorEnvioToken] = useState(false);
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [showResendKey, setShowResendKey] = useState(false);
  const [pixDiscountPercent, setPixDiscountPercent] = useState('19');
  const [maxInstallments, setMaxInstallments] = useState('6');
  const [installmentsInterest, setInstallmentsInterest] = useState('sem_juros');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchingProfile, setFetchingProfile] = useState(false);

  // Evolution API
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [evolutionInstanceName, setEvolutionInstanceName] = useState('');
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testingAsaas, setTestingAsaas] = useState(false);

  // Sender address
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [senderDocument, setSenderDocument] = useState('');
  const [senderPostalCode, setSenderPostalCode] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [senderComplement, setSenderComplement] = useState('');
  const [senderDistrict, setSenderDistrict] = useState('');
  const [senderCity, setSenderCity] = useState('');
  const [senderState, setSenderState] = useState('');

  // Package defaults
  const [packageHeight, setPackageHeight] = useState('4');
  const [packageWidth, setPackageWidth] = useState('12');
  const [packageLength, setPackageLength] = useState('17');
  const [packageWeight, setPackageWeight] = useState('0.1');

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      // Remove code from URL
      window.history.replaceState({}, '', window.location.pathname);
      
      (async () => {
        try {
          const { data: userData } = await supabase.auth.getUser();
          const redirectUri = `${window.location.origin}/admin/configuracoes`;
          
          const { data, error } = await supabase.functions.invoke('melhor-envio-oauth', {
            body: {
              action: 'exchange_code',
              user_id: userData.user?.id,
              redirect_uri: redirectUri,
              code,
            },
          });
          
          if (error || data?.error) throw new Error(data?.error || error?.message);
          toast({ title: 'Melhor Envio conectado com sucesso!', description: `Token expira em ${new Date(data.expires_at).toLocaleString('pt-BR')}` });
          setMelhorEnvioTokenExpires(data.expires_at);
          // Reload settings
          const newToken = await fetchSetting('melhor_envio_token');
          setMelhorEnvioToken(newToken);
        } catch (err: any) {
          toast({ title: 'Erro ao conectar', description: err.message, variant: 'destructive' });
        }
      })();
    }
  }, []);

  // Load Melhor Envio env-specific credentials
  const loadMelhorEnvioCredentials = async (env: string) => {
    const [meToken, meClientId, meClientSecret, meTokenExpires] = await Promise.all([
      fetchSetting(`melhor_envio_token_${env}`),
      fetchSetting(`melhor_envio_client_id_${env}`),
      fetchSetting(`melhor_envio_client_secret_${env}`),
      fetchSetting(`melhor_envio_token_expires_at_${env}`),
    ]);
    setMelhorEnvioToken(meToken);
    setMelhorEnvioClientId(meClientId);
    setMelhorEnvioClientSecret(meClientSecret || '');
    setMelhorEnvioTokenExpires(meTokenExpires || '');
  };

  useEffect(() => {
    Promise.all([
      fetchSetting('whatsapp_number'),
      fetchSetting('asaas_api_key'),
      fetchSetting('asaas_environment'),
      fetchSetting('asaas_webhook_token'),
      fetchSetting('melhor_envio_environment'),
      fetchSetting('melhor_envio_sender'),
      fetchSetting('resend_api_key'),
      fetchSetting('resend_from_email'),
      fetchSetting('pix_discount_percent'),
      fetchSetting('max_installments'),
      fetchSetting('installments_interest'),
    ]).then(async ([wp, apiKey, env, webhookToken, meEnv, senderJson, rKey, rFrom, pixDisc, maxInst, instInterest]) => {
      setWhatsapp(wp);
      setAsaasApiKey(apiKey);
      setAsaasEnv(env || 'sandbox');
      setAsaasWebhookToken(webhookToken || '');
      setPixDiscountPercent(pixDisc || '19');
      setMaxInstallments(maxInst || '6');
      setInstallmentsInterest(instInterest || 'sem_juros');
      const currentMeEnv = meEnv || 'sandbox';
      setMelhorEnvioEnv(currentMeEnv);

      // Load env-specific credentials
      await loadMelhorEnvioCredentials(currentMeEnv);

      // Load Evolution API settings
      const [evoUrl, evoKey, evoInstance] = await Promise.all([
        fetchSetting('evolution_api_url'),
        fetchSetting('evolution_api_key'),
        fetchSetting('evolution_instance_name'),
      ]);
      setEvolutionApiUrl(evoUrl || '');
      setEvolutionApiKey(evoKey || '');
      setEvolutionInstanceName(evoInstance || '');

      if (senderJson) {
        try {
          const s = JSON.parse(senderJson);
          setSenderName(s.name || '');
          setSenderPhone(s.phone || '');
          setSenderEmail(s.email || '');
          setSenderDocument(s.document || '');
          setSenderPostalCode(s.postal_code || '');
          setSenderAddress(s.address || '');
          setSenderNumber(s.number || '');
          setSenderComplement(s.complement || '');
          setSenderDistrict(s.district || '');
          setSenderCity(s.city || '');
          setSenderState(s.state || '');
          setPackageHeight(String(s.package_height || '4'));
          setPackageWidth(String(s.package_width || '12'));
          setPackageLength(String(s.package_length || '17'));
          setPackageWeight(String(s.package_weight || '0.1'));
        } catch {}
      }
      setResendApiKey(rKey || '');
      setResendFromEmail(rFrom || 'onboarding@resend.dev');
    }).finally(() => setLoading(false));
  }, []);

  // When environment changes, save current credentials and load the new env's
  const handleMelhorEnvioEnvChange = async (newEnv: string) => {
    // Save current env credentials before switching
    const oldEnv = melhorEnvioEnv;
    if (melhorEnvioClientId || melhorEnvioClientSecret || melhorEnvioToken) {
      await Promise.all([
        upsertSetting(`melhor_envio_client_id_${oldEnv}`, melhorEnvioClientId),
        upsertSetting(`melhor_envio_client_secret_${oldEnv}`, melhorEnvioClientSecret),
        upsertSetting(`melhor_envio_token_${oldEnv}`, melhorEnvioToken),
      ]);
    }
    setMelhorEnvioEnv(newEnv);
    await loadMelhorEnvioCredentials(newEnv);
  };

  // Format helpers
  const formatCpfCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 11) {
      // CPF: 000.000.000-00
      return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    // CNPJ: 00.000.000/0001-00
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    }
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  };

  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
  };

  const validateSenderFields = () => {
    const docDigits = senderDocument.replace(/\D/g, '');
    if (docDigits && docDigits.length !== 11 && docDigits.length !== 14) {
      toast({ title: 'CPF/CNPJ inválido', description: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.', variant: 'destructive' });
      return false;
    }
    const phoneDigits = senderPhone.replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length < 10) {
      toast({ title: 'Telefone inválido', description: 'O telefone deve ter pelo menos 10 dígitos (com DDD).', variant: 'destructive' });
      return false;
    }
    const cepDigits = senderPostalCode.replace(/\D/g, '');
    if (cepDigits && cepDigits.length !== 8) {
      toast({ title: 'CEP inválido', description: 'O CEP deve ter exatamente 8 dígitos.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateSenderFields()) return;
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const uid = user.id;

      const senderData = JSON.stringify({
        name: senderName,
        phone: senderPhone.replace(/\D/g, ''),
        email: senderEmail,
        document: senderDocument.replace(/\D/g, ''),
        postal_code: senderPostalCode.replace(/\D/g, ''),
        address: senderAddress,
        number: senderNumber,
        complement: senderComplement,
        district: senderDistrict,
        city: senderCity,
        state: senderState,
        package_height: Number(packageHeight) || 4,
        package_width: Number(packageWidth) || 12,
        package_length: Number(packageLength) || 17,
        package_weight: Number(packageWeight) || 0.1,
      });

      await Promise.all([
        upsertSetting('whatsapp_number', whatsapp, uid),
        upsertSetting('asaas_api_key', asaasApiKey, uid),
        upsertSetting('asaas_environment', asaasEnv, uid),
        upsertSetting('asaas_webhook_token', asaasWebhookToken, uid),
        upsertSetting(`melhor_envio_token_${melhorEnvioEnv}`, melhorEnvioToken, uid),
        upsertSetting(`melhor_envio_client_id_${melhorEnvioEnv}`, melhorEnvioClientId, uid),
        upsertSetting(`melhor_envio_client_secret_${melhorEnvioEnv}`, melhorEnvioClientSecret, uid),
        upsertSetting('melhor_envio_environment', melhorEnvioEnv, uid),
        upsertSetting('melhor_envio_sender', senderData, uid),
        upsertSetting('resend_api_key', resendApiKey, uid),
        upsertSetting('resend_from_email', resendFromEmail, uid),
        upsertSetting('evolution_api_url', evolutionApiUrl, uid),
        upsertSetting('evolution_api_key', evolutionApiKey, uid),
        upsertSetting('evolution_instance_name', evolutionInstanceName, uid),
        upsertSetting('pix_discount_percent', pixDiscountPercent, uid),
        upsertSetting('max_installments', maxInstallments, uid),
        upsertSetting('installments_interest', installmentsInterest, uid),
      ]);
      toast({ title: 'Configurações salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="w-5 h-5" /> WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Número do WhatsApp (com código do país)</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))}
              placeholder="5511999999999"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Formato: código do país + DDD + número. Ex: 5511999999999
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Formas de Pagamento (Catálogo)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desconto PIX (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={pixDiscountPercent}
                onChange={(e) => setPixDiscountPercent(e.target.value)}
                placeholder="19"
              />
              <p className="text-xs text-muted-foreground">
                Percentual de desconto para pagamento via PIX
              </p>
            </div>
            <div className="space-y-2">
              <Label>Máx. Parcelas</Label>
              <Select value={maxInstallments} onValueChange={setMaxInstallments}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Máximo de parcelas no catálogo e checkout
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Parcelas</Label>
              <Select value={installmentsInterest} onValueChange={setInstallmentsInterest}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_juros">Sem juros</SelectItem>
                  <SelectItem value="com_juros">Com juros</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Define se as parcelas são exibidas como "sem juros" ou "com juros"
              </p>
            </div>
          </div>
          <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Preview:</p>
            <p className="text-success text-xs font-semibold">{pixDiscountPercent}% OFF no Pix</p>
            <p className="text-[11px]">ou R$ 100,00 em {maxInstallments}x R$ {(100 / Number(maxInstallments || 1)).toFixed(2).replace('.', ',')}{installmentsInterest === 'sem_juros' ? ' sem juros' : ''}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Asaas - Checkout Transparente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={asaasEnv} onValueChange={setAsaasEnv}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={asaasApiKey}
                onChange={(e) => setAsaasApiKey(e.target.value)}
                placeholder="$aact_..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre sua API Key no painel do Asaas em Configurações → Integrações → API
            </p>
          </div>
          <div className="space-y-2">
            <Label>Token de Autenticação do Webhook</Label>
            <div className="relative">
              <Input
                type={showWebhookToken ? 'text' : 'password'}
                value={asaasWebhookToken}
                onChange={(e) => setAsaasWebhookToken(e.target.value)}
                placeholder="Token definido no Asaas"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowWebhookToken(!showWebhookToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showWebhookToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Mesmo token configurado no painel do Asaas em Webhooks → Token de autenticação
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">URL do Webhook (copie para o Asaas)</Label>
            <Input
              readOnly
              value="https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/asaas-webhook"
              className="bg-muted text-xs"
              onClick={(e) => {
                (e.target as HTMLInputElement).select();
                navigator.clipboard.writeText("https://vkomfiplmhpkhfpidrng.supabase.co/functions/v1/asaas-webhook");
                toast({ title: 'URL copiada!' });
              }}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={testingAsaas || !asaasApiKey}
            onClick={async () => {
              setTestingAsaas(true);
              try {
                const { data, error } = await supabase.functions.invoke('asaas-checkout', {
                  body: { action: 'test_connection', environment: asaasEnv, api_key: asaasApiKey },
                });
                if (error) throw new Error(error.message);
                if (data?.error) throw new Error(data.error);
                toast({ title: '✅ Conexão com Asaas OK!', description: `Ambiente: ${asaasEnv === 'production' ? 'Produção' : 'Sandbox'}. Carteira ID: ${data?.walletId || 'N/A'}` });
              } catch (err: any) {
                toast({ title: 'Falha na conexão', description: err.message, variant: 'destructive' });
              } finally {
                setTestingAsaas(false);
              }
            }}
          >
            {testingAsaas ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Testar Conexão
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="w-5 h-5" /> Melhor Envio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={melhorEnvioEnv} onValueChange={handleMelhorEnvioEnvChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input
              value={melhorEnvioClientId}
              onChange={(e) => setMelhorEnvioClientId(e.target.value)}
              placeholder="Seu Client ID do Melhor Envio"
            />
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <div className="relative">
              <Input
                type={showClientSecret ? 'text' : 'password'}
                value={melhorEnvioClientSecret}
                onChange={(e) => setMelhorEnvioClientSecret(e.target.value)}
                placeholder="Seu Client Secret do Melhor Envio"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowClientSecret(!showClientSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre em Melhor Envio → Configurações → Tokens → Seu app → Client Secret
            </p>
          </div>

          {/* OAuth Status */}
          {melhorEnvioTokenExpires && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border/50">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <div className="text-sm">
                <span className="font-medium">Conectado</span>
                <span className="text-muted-foreground ml-1">
                  — Token expira em {new Date(melhorEnvioTokenExpires).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
          )}

          {/* OAuth Connect Button */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={oauthConnecting || !melhorEnvioClientId || !melhorEnvioClientSecret}
              onClick={async () => {
                setOauthConnecting(true);
                try {
                  // Save settings first
                  await Promise.all([
                    upsertSetting(`melhor_envio_client_id_${melhorEnvioEnv}`, melhorEnvioClientId),
                    upsertSetting(`melhor_envio_client_secret_${melhorEnvioEnv}`, melhorEnvioClientSecret),
                    upsertSetting('melhor_envio_environment', melhorEnvioEnv),
                  ]);

                  const { data: userData } = await supabase.auth.getUser();
                  const redirectUri = `${window.location.origin}/admin/configuracoes`;

                  const { data, error } = await supabase.functions.invoke('melhor-envio-oauth', {
                    body: {
                      action: 'get_auth_url',
                      user_id: userData.user?.id,
                      redirect_uri: redirectUri,
                    },
                  });

                  if (error || data?.error) throw new Error(data?.error || error?.message);
                  window.location.href = data.auth_url;
                } catch (err: any) {
                  toast({ title: 'Erro', description: err.message, variant: 'destructive' });
                } finally {
                  setOauthConnecting(false);
                }
              }}
              className="flex items-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              {oauthConnecting ? 'Conectando...' : 'Conectar com Melhor Envio (OAuth2)'}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Token de Acesso (manual)</Label>
            <div className="relative">
              <Input
                type={showMelhorEnvioToken ? 'text' : 'password'}
                value={melhorEnvioToken}
                onChange={(e) => setMelhorEnvioToken(e.target.value)}
                placeholder="Ou cole manualmente seu token"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowMelhorEnvioToken(!showMelhorEnvioToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showMelhorEnvioToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Opcional: use OAuth2 acima para renovação automática, ou cole o token manualmente.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">URL de Redirecionamento OAuth (copie para o Melhor Envio)</Label>
            <Input
              readOnly
              value={`${window.location.origin}/admin/configuracoes`}
              className="bg-muted text-xs"
              onClick={(e) => {
                (e.target as HTMLInputElement).select();
                navigator.clipboard.writeText(`${window.location.origin}/admin/configuracoes`);
                toast({ title: 'URL copiada!' });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="w-5 h-5" /> Resend - Email de Notificação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key do Resend</Label>
            <div className="relative">
              <Input
                type={showResendKey ? 'text' : 'password'}
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder="re_..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowResendKey(!showResendKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showResendKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre sua API Key em resend.com → API Keys
            </p>
          </div>
          <div className="space-y-2">
            <Label>Email de envio (From)</Label>
            <Input
              value={resendFromEmail}
              onChange={(e) => setResendFromEmail(e.target.value)}
              placeholder="onboarding@resend.dev"
            />
            <p className="text-xs text-muted-foreground">
              Use onboarding@resend.dev para testes ou configure seu domínio no Resend para usar um email personalizado.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Endereço do Remetente (Melhor Envio)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Preencha com os dados de quem envia os produtos. Usado para gerar etiquetas de frete.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fetchingProfile || !melhorEnvioToken}
              onClick={async () => {
                setFetchingProfile(true);
                try {
                  const { data, error } = await supabase.functions.invoke('melhor-envio-shipment', {
                    body: { action: 'fetch_profile' },
                  });
                  if (error || data?.error) throw new Error(data?.error || error?.message);
                  const p = data.profile;
                  if (p.name) setSenderName(p.name);
                  if (p.phone) setSenderPhone(p.phone);
                  if (p.email) setSenderEmail(p.email);
                  if (p.document) setSenderDocument(p.document);
                  if (p.postal_code) setSenderPostalCode(p.postal_code);
                  if (p.address) setSenderAddress(p.address);
                  if (p.number) setSenderNumber(p.number);
                  if (p.complement) setSenderComplement(p.complement);
                  if (p.district) setSenderDistrict(p.district);
                  if (p.city) setSenderCity(p.city);
                  if (p.state) setSenderState(p.state);
                  toast({ title: 'Dados importados do Melhor Envio!' });
                } catch (err: any) {
                  toast({ title: 'Erro ao buscar perfil', description: err.message, variant: 'destructive' });
                } finally {
                  setFetchingProfile(false);
                }
              }}
              className="flex items-center gap-2 shrink-0"
            >
              {fetchingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {fetchingProfile ? 'Importando...' : 'Importar do Melhor Envio'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome / Razão Social</Label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Liberty Pharma" />
            </div>
            <div className="space-y-2">
              <Label>CPF / CNPJ</Label>
              <Input value={formatCpfCnpj(senderDocument)} onChange={(e) => setSenderDocument(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="000.000.000-00" />
              {senderDocument && senderDocument.replace(/\D/g, '').length > 0 && senderDocument.replace(/\D/g, '').length !== 11 && senderDocument.replace(/\D/g, '').length !== 14 && (
                <p className="text-xs text-destructive">CPF deve ter 11 dígitos ou CNPJ 14 dígitos</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={formatPhone(senderPhone)} onChange={(e) => setSenderPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="(41) 99999-0000" />
              {senderPhone && senderPhone.replace(/\D/g, '').length > 0 && senderPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-xs text-destructive">Telefone deve ter pelo menos 10 dígitos</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input value={formatCep(senderPostalCode)} onChange={(e) => setSenderPostalCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="80000-000" />
              {senderPostalCode && senderPostalCode.replace(/\D/g, '').length > 0 && senderPostalCode.replace(/\D/g, '').length !== 8 && (
                <p className="text-xs text-destructive">CEP deve ter 8 dígitos</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} placeholder="Rua Exemplo" />
            </div>
            <div className="space-y-2">
              <Label>Número</Label>
              <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="123" />
            </div>
            <div className="space-y-2">
              <Label>Complemento</Label>
              <Input value={senderComplement} onChange={(e) => setSenderComplement(e.target.value)} placeholder="Sala 1" />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input value={senderDistrict} onChange={(e) => setSenderDistrict(e.target.value)} placeholder="Centro" />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={senderCity} onChange={(e) => setSenderCity(e.target.value)} placeholder="Curitiba" />
            </div>
            <div className="space-y-2">
              <Label>Estado (sigla)</Label>
              <Input value={senderState} onChange={(e) => setSenderState(e.target.value)} placeholder="PR" maxLength={2} />
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <p className="text-sm font-medium text-foreground mb-3">Dimensões padrão da embalagem</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Altura (cm)</Label>
                <Input type="number" value={packageHeight} onChange={(e) => setPackageHeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Largura (cm)</Label>
                <Input type="number" value={packageWidth} onChange={(e) => setPackageWidth(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Comprimento (cm)</Label>
                <Input type="number" value={packageLength} onChange={(e) => setPackageLength(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input type="number" step="0.01" value={packageWeight} onChange={(e) => setPackageWeight(e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> Evolution API - Mensagens WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL da API</Label>
            <Input
              value={evolutionApiUrl}
              onChange={(e) => setEvolutionApiUrl(e.target.value)}
              placeholder="https://evocooli.vw2.shop"
            />
            <p className="text-xs text-muted-foreground">
              URL base da sua instância Evolution API (sem barra final)
            </p>
          </div>
          <div className="space-y-2">
            <Label>Nome da Instância</Label>
            <Input
              value={evolutionInstanceName}
              onChange={(e) => setEvolutionInstanceName(e.target.value)}
              placeholder="minha-instancia"
            />
          </div>
          <div className="space-y-2">
            <Label>API Key (Global)</Label>
            <div className="relative">
              <Input
                type={showEvolutionKey ? 'text' : 'password'}
                value={evolutionApiKey}
                onChange={(e) => setEvolutionApiKey(e.target.value)}
                placeholder="Sua apikey global"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowEvolutionKey(!showEvolutionKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showEvolutionKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <p className="text-sm font-medium text-foreground mb-3">Enviar mensagem de teste</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número (com código do país)</Label>
                <Input
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="559999999999"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Input
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Olá, teste de envio!"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 flex items-center gap-2"
              disabled={sendingTest || !testNumber || !testMessage || !evolutionApiUrl || !evolutionApiKey || !evolutionInstanceName}
              onClick={async () => {
                setSendingTest(true);
                try {
                  const { data, error } = await supabase.functions.invoke('evolution-send-message', {
                    body: { number: testNumber, text: testMessage },
                  });
                  if (error) throw new Error(error.message);
                  if (data?.error) throw new Error(data.error);
                  toast({ title: 'Mensagem enviada com sucesso!' });
                } catch (err: any) {
                  toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
                } finally {
                  setSendingTest(false);
                }
              }}
            >
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingTest ? 'Enviando...' : 'Enviar Teste'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  );
};

export default SettingsPage;
