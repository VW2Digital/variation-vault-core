import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Truck, MapPin, Eye, EyeOff, Link2, CheckCircle2, Loader2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsBackButton from './SettingsBackButton';
import WebhookUrlCard from '@/components/admin/WebhookUrlCard';
import PublicSiteUrlCard from '@/components/admin/PublicSiteUrlCard';
import { usePublicBaseUrl } from '@/hooks/usePublicBaseUrl';

const SettingsShipping = () => {
  const { toast } = useToast();
  const { publicUrl, browserIsInternal } = usePublicBaseUrl();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [melhorEnvioToken, setMelhorEnvioToken] = useState('');
  const [melhorEnvioClientId, setMelhorEnvioClientId] = useState('');
  const [melhorEnvioClientSecret, setMelhorEnvioClientSecret] = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [melhorEnvioEnv, setMelhorEnvioEnv] = useState('sandbox');
  const [melhorEnvioTokenExpires, setMelhorEnvioTokenExpires] = useState('');
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [showMelhorEnvioToken, setShowMelhorEnvioToken] = useState(false);
  const [fetchingProfile, setFetchingProfile] = useState(false);

  // Sender
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
  const [packageHeight, setPackageHeight] = useState('4');
  const [packageWidth, setPackageWidth] = useState('12');
  const [packageLength, setPackageLength] = useState('17');
  const [packageWeight, setPackageWeight] = useState('0.1');

  const formatCpfCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 11) return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return digits.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  };

  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
  };

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

  const handleMelhorEnvioEnvChange = async (newEnv: string) => {
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

  // OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      (async () => {
        try {
          const { data: userData } = await supabase.auth.getUser();
          const redirectUri = `${window.location.origin}/admin/configuracoes/logistica`;
          const { data, error } = await supabase.functions.invoke('melhor-envio-oauth', {
            body: { action: 'exchange_code', user_id: userData.user?.id, redirect_uri: redirectUri, code },
          });
          if (error || data?.error) throw new Error(data?.error || error?.message);
          toast({ title: 'Melhor Envio conectado com sucesso!', description: `Token expira em ${new Date(data.expires_at).toLocaleString('pt-BR')}` });
          setMelhorEnvioTokenExpires(data.expires_at);
          const newToken = await fetchSetting('melhor_envio_token');
          setMelhorEnvioToken(newToken);
        } catch (err: any) {
          toast({ title: 'Erro ao conectar', description: err.message, variant: 'destructive' });
        }
      })();
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetchSetting('melhor_envio_environment'),
      fetchSetting('melhor_envio_sender'),
    ]).then(async ([meEnv, senderJson]) => {
      const currentMeEnv = meEnv || 'sandbox';
      setMelhorEnvioEnv(currentMeEnv);
      await loadMelhorEnvioCredentials(currentMeEnv);
      if (senderJson) {
        try {
          const s = JSON.parse(senderJson);
          setSenderName(s.name || ''); setSenderPhone(s.phone || ''); setSenderEmail(s.email || '');
          setSenderDocument(s.document || ''); setSenderPostalCode(s.postal_code || '');
          setSenderAddress(s.address || ''); setSenderNumber(s.number || '');
          setSenderComplement(s.complement || ''); setSenderDistrict(s.district || '');
          setSenderCity(s.city || ''); setSenderState(s.state || '');
          setPackageHeight(String(s.package_height || '4')); setPackageWidth(String(s.package_width || '12'));
          setPackageLength(String(s.package_length || '17')); setPackageWeight(String(s.package_weight || '0.1'));
        } catch {}
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const uid = user.id;
      const senderData = JSON.stringify({
        name: senderName, phone: senderPhone.replace(/\D/g, ''), email: senderEmail,
        document: senderDocument.replace(/\D/g, ''), postal_code: senderPostalCode.replace(/\D/g, ''),
        address: senderAddress, number: senderNumber, complement: senderComplement,
        district: senderDistrict, city: senderCity, state: senderState,
        package_height: Number(packageHeight) || 4, package_width: Number(packageWidth) || 12,
        package_length: Number(packageLength) || 17, package_weight: Number(packageWeight) || 0.1,
      });
      await Promise.all([
        upsertSetting(`melhor_envio_token_${melhorEnvioEnv}`, melhorEnvioToken, uid),
        upsertSetting(`melhor_envio_client_id_${melhorEnvioEnv}`, melhorEnvioClientId, uid),
        upsertSetting(`melhor_envio_client_secret_${melhorEnvioEnv}`, melhorEnvioClientSecret, uid),
        upsertSetting('melhor_envio_environment', melhorEnvioEnv, uid),
        upsertSetting('melhor_envio_sender', senderData, uid),
      ]);
      toast({ title: 'Configurações de logística salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Melhor Envio & Frete" description="Integração, remetente e dimensões de embalagem" />

      <PublicSiteUrlCard />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Truck className="w-5 h-5" /> Melhor Envio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={melhorEnvioEnv} onValueChange={handleMelhorEnvioEnvChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (Testes)</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input value={melhorEnvioClientId} onChange={(e) => setMelhorEnvioClientId(e.target.value)} placeholder="Seu Client ID" />
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <div className="relative">
              <Input type={showClientSecret ? 'text' : 'password'} value={melhorEnvioClientSecret} onChange={(e) => setMelhorEnvioClientSecret(e.target.value)} placeholder="Seu Client Secret" className="pr-10" />
              <button type="button" onClick={() => setShowClientSecret(!showClientSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {melhorEnvioTokenExpires && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border/50">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <div className="text-sm">
                <span className="font-medium">Conectado</span>
                <span className="text-muted-foreground ml-1">— Token expira em {new Date(melhorEnvioTokenExpires).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={oauthConnecting || !melhorEnvioClientId || !melhorEnvioClientSecret} onClick={async () => {
              setOauthConnecting(true);
              try {
                await Promise.all([
                  upsertSetting(`melhor_envio_client_id_${melhorEnvioEnv}`, melhorEnvioClientId),
                  upsertSetting(`melhor_envio_client_secret_${melhorEnvioEnv}`, melhorEnvioClientSecret),
                  upsertSetting('melhor_envio_environment', melhorEnvioEnv),
                ]);
                const { data: userData } = await supabase.auth.getUser();
                // IMPORTANTE: usa SEMPRE a URL pública canônica (configurada pelo admin)
                // — o Melhor Envio rejeita redirect_uri com o host interno do Lovable.
                const baseForOAuth = publicUrl || window.location.origin;
                if (browserIsInternal && !publicUrl) {
                  toast({
                    title: 'Configure a URL pública primeiro',
                    description: 'Defina a URL pública da loja no card acima antes de conectar — o Melhor Envio rejeita o domínio do preview.',
                    variant: 'destructive',
                  });
                  return;
                }
                const redirectUri = `${baseForOAuth}/admin/configuracoes/logistica`;
                const { data, error } = await supabase.functions.invoke('melhor-envio-oauth', {
                  body: { action: 'get_auth_url', user_id: userData.user?.id, redirect_uri: redirectUri },
                });
                if (error || data?.error) throw new Error(data?.error || error?.message);
                window.location.href = data.auth_url;
              } catch (err: any) {
                toast({ title: 'Erro', description: err.message, variant: 'destructive' });
              } finally { setOauthConnecting(false); }
            }} className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              {oauthConnecting ? 'Conectando...' : 'Conectar com Melhor Envio (OAuth2)'}
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Token de Acesso (manual)</Label>
            <div className="relative">
              <Input type={showMelhorEnvioToken ? 'text' : 'password'} value={melhorEnvioToken} onChange={(e) => setMelhorEnvioToken(e.target.value)} placeholder="Ou cole manualmente seu token" className="pr-10" />
              <button type="button" onClick={() => setShowMelhorEnvioToken(!showMelhorEnvioToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showMelhorEnvioToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">URL de Redirecionamento OAuth</Label>
            <Input
              readOnly
              value={
                publicUrl
                  ? `${publicUrl}/admin/configuracoes/logistica`
                  : browserIsInternal
                    ? '⚠️ Configure a URL pública da loja acima'
                    : `${window.location.origin}/admin/configuracoes/logistica`
              }
              className="bg-muted text-xs font-mono"
              onClick={(e) => {
                if (!publicUrl && browserIsInternal) {
                  toast({
                    title: 'URL pública não configurada',
                    description: 'Defina a URL pública da loja no card no topo desta página.',
                    variant: 'destructive',
                  });
                  return;
                }
                const base = publicUrl || window.location.origin;
                const url = `${base}/admin/configuracoes/logistica`;
                (e.target as HTMLInputElement).select();
                navigator.clipboard.writeText(url);
                toast({ title: 'URL copiada!' });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Cole exatamente esta URL no Melhor Envio em <strong>Aplicativos → Sua app → Redirect URIs</strong>.
            </p>
          </div>

          <WebhookUrlCard
            gatewayName="Melhor Envio"
            functionSlug="melhor-envio-webhook"
            cadastroHint="no painel do Melhor Envio, em Configurações → Webhooks (evita o erro E-WBH-0002)"
            eventos={["order.posted", "order.delivered", "order.canceled"]}
          />
        </CardContent>
      </Card>

      {/* Sender Address */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><MapPin className="w-5 h-5" /> Endereço do Remetente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Dados de quem envia os produtos. Usado para gerar etiquetas de frete.</p>
            <Button type="button" variant="outline" size="sm" disabled={fetchingProfile || !melhorEnvioToken} onClick={async () => {
              setFetchingProfile(true);
              try {
                const { data, error } = await supabase.functions.invoke('melhor-envio-shipment', { body: { action: 'fetch_profile' } });
                if (error || data?.error) throw new Error(data?.error || error?.message);
                const p = data.profile;
                if (p.name) setSenderName(p.name); if (p.phone) setSenderPhone(p.phone);
                if (p.email) setSenderEmail(p.email); if (p.document) setSenderDocument(p.document);
                if (p.postal_code) setSenderPostalCode(p.postal_code); if (p.address) setSenderAddress(p.address);
                if (p.number) setSenderNumber(p.number); if (p.complement) setSenderComplement(p.complement);
                if (p.district) setSenderDistrict(p.district); if (p.city) setSenderCity(p.city);
                if (p.state) setSenderState(p.state);
                toast({ title: 'Dados importados do Melhor Envio!' });
              } catch (err: any) {
                toast({ title: 'Erro ao buscar perfil', description: err.message, variant: 'destructive' });
              } finally { setFetchingProfile(false); }
            }} className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {fetchingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {fetchingProfile ? 'Importando...' : 'Importar do Melhor Envio'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nome / Razão Social</Label><Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Liberty Pharma" /></div>
            <div className="space-y-2"><Label>CPF / CNPJ</Label><Input value={formatCpfCnpj(senderDocument)} onChange={(e) => setSenderDocument(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="000.000.000-00" /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={formatPhone(senderPhone)} onChange={(e) => setSenderPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="(41) 99999-0000" /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="contato@empresa.com" /></div>
            <div className="space-y-2"><Label>CEP</Label><Input value={formatCep(senderPostalCode)} onChange={(e) => setSenderPostalCode(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="80000-000" /></div>
            <div className="space-y-2"><Label>Endereço</Label><Input value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} placeholder="Rua Exemplo" /></div>
            <div className="space-y-2"><Label>Número</Label><Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="123" /></div>
            <div className="space-y-2"><Label>Complemento</Label><Input value={senderComplement} onChange={(e) => setSenderComplement(e.target.value)} placeholder="Sala 1" /></div>
            <div className="space-y-2"><Label>Bairro</Label><Input value={senderDistrict} onChange={(e) => setSenderDistrict(e.target.value)} placeholder="Centro" /></div>
            <div className="space-y-2"><Label>Cidade</Label><Input value={senderCity} onChange={(e) => setSenderCity(e.target.value)} placeholder="Curitiba" /></div>
            <div className="space-y-2"><Label>Estado (sigla)</Label><Input value={senderState} onChange={(e) => setSenderState(e.target.value)} placeholder="PR" maxLength={2} /></div>
          </div>
          <div className="pt-4 border-t border-border/50">
            <p className="text-sm font-medium text-foreground mb-3">Dimensões padrão da embalagem</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>Altura (cm)</Label><Input type="number" value={packageHeight} onChange={(e) => setPackageHeight(e.target.value)} /></div>
              <div className="space-y-2"><Label>Largura (cm)</Label><Input type="number" value={packageWidth} onChange={(e) => setPackageWidth(e.target.value)} /></div>
              <div className="space-y-2"><Label>Comprimento (cm)</Label><Input type="number" value={packageLength} onChange={(e) => setPackageLength(e.target.value)} /></div>
              <div className="space-y-2"><Label>Peso (kg)</Label><Input type="number" step="0.01" value={packageWeight} onChange={(e) => setPackageWeight(e.target.value)} /></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsShipping;
