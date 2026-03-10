import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Phone, CreditCard, Eye, EyeOff, Truck, MapPin, Mail, Link2, CheckCircle2 } from 'lucide-react';
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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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
    ]).then(async ([wp, apiKey, env, webhookToken, meEnv, senderJson, rKey, rFrom]) => {
      setWhatsapp(wp);
      setAsaasApiKey(apiKey);
      setAsaasEnv(env || 'sandbox');
      setAsaasWebhookToken(webhookToken || '');
      const currentMeEnv = meEnv || 'sandbox';
      setMelhorEnvioEnv(currentMeEnv);

      // Load env-specific credentials
      await loadMelhorEnvioCredentials(currentMeEnv);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const senderData = JSON.stringify({
        name: senderName,
        phone: senderPhone,
        email: senderEmail,
        document: senderDocument,
        postal_code: senderPostalCode,
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
        upsertSetting('whatsapp_number', whatsapp),
        upsertSetting('asaas_api_key', asaasApiKey),
        upsertSetting('asaas_environment', asaasEnv),
        upsertSetting('asaas_webhook_token', asaasWebhookToken),
        upsertSetting(`melhor_envio_token_${melhorEnvioEnv}`, melhorEnvioToken),
        upsertSetting(`melhor_envio_client_id_${melhorEnvioEnv}`, melhorEnvioClientId),
        upsertSetting(`melhor_envio_client_secret_${melhorEnvioEnv}`, melhorEnvioClientSecret),
        upsertSetting('melhor_envio_environment', melhorEnvioEnv),
        upsertSetting('melhor_envio_sender', senderData),
        upsertSetting('resend_api_key', resendApiKey),
        upsertSetting('resend_from_email', resendFromEmail),
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
          <p className="text-sm text-muted-foreground">
            Preencha com os dados de quem envia os produtos. Usado para gerar etiquetas de frete.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome / Razão Social</Label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Liberty Pharma" />
            </div>
            <div className="space-y-2">
              <Label>CPF / CNPJ</Label>
              <Input value={senderDocument} onChange={(e) => setSenderDocument(e.target.value)} placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="41999990000" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="contato@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input value={senderPostalCode} onChange={(e) => setSenderPostalCode(e.target.value)} placeholder="80000-000" />
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

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  );
};

export default SettingsPage;
