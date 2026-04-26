import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plug, Copy, Check, ExternalLink, Key, RefreshCw, Save, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_ENDPOINT = `${SUPABASE_URL}/functions/v1/orders-api`;

const generateApiKey = () => {
  return 'sk_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
};

const SettingsAPI = () => {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'orders_api_key')
      .maybeSingle();
    if (data?.value) {
      setApiKey(data.value);
      setSavedApiKey(data.value);
    }
    setLoading(false);
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      toast({ title: 'Erro', description: 'A API Key não pode ser vazia', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) {
      toast({ title: 'Erro', description: 'Usuário não autenticado', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('site_settings')
      .upsert(
        { key: 'orders_api_key', value: apiKey, user_id: userId },
        { onConflict: 'key' }
      );

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      setSavedApiKey(apiKey);
      toast({ title: 'API Key salva com sucesso!' });
    }
    setSaving(false);
  };

  const handleGenerate = () => {
    const newKey = generateApiKey();
    setApiKey(newKey);
    setShowKey(true);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({ title: 'Copiado!' });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => copyToClipboard(text, field)}
      className="shrink-0"
    >
      {copiedField === field ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </Button>
  );

  const maskedKey = savedApiKey ? savedApiKey.slice(0, 6) + '••••••••••••••••' + savedApiKey.slice(-4) : '';

  const exampleCurl = `curl -X GET "${API_ENDPOINT}?status=paid&per_page=10" \\
  -H "x-api-key: ${savedApiKey || 'SUA_API_KEY'}"`;

  const exampleFilters = `# Filtros disponíveis (query params):
?id=UUID                    # Pedido específico
?status=paid                # Status: pending, paid, cancelled, refunded
?payment_method=credit_card # Método: credit_card, pix, boleto
?payment_gateway=mercadopago
?customer_email=email@ex.com
?customer_name=João
?customer_cpf=12345678900
?product_name=Produto
?coupon_code=DESC10
?delivery_status=delivered
?shipping_service=SEDEX
?min_value=100              # Valor mínimo
?max_value=500              # Valor máximo
?date_from=2025-01-01       # Data início
?date_to=2025-12-31         # Data fim
?page=1                     # Paginação (default: 1)
?per_page=50                # Itens por página (max: 100)
?sort_by=created_at         # Ordenar por campo
?sort_order=desc            # asc ou desc`;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Integração API" description="Conecte seu CRM ou agente de IA para consultar pedidos" />

      {/* API Key Management */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="w-5 h-5" /> Chave de Acesso (API Key)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Gere uma chave de acesso e copie para configurar no seu CRM ou agente de IA. Esta chave é necessária para autenticar as requisições.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando chave…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Clique em 'Gerar nova chave' ou insira manualmente"
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {apiKey && <CopyButton text={apiKey} field="apikey" />}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleGenerate}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Gerar nova chave
                </Button>
                <Button
                  size="sm"
                  onClick={saveApiKey}
                  disabled={saving || !apiKey || apiKey === savedApiKey}
                >
                  <Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>

              {savedApiKey && (
                <div className="rounded-lg bg-accent/30 p-3 space-y-1">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Chave ativa
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground">{maskedKey}</code>
                    <CopyButton text={savedApiKey} field="savedkey" />
                  </div>
                </div>
              )}

              {!savedApiKey && (
                <div className="rounded-lg bg-destructive/10 p-3">
                  <p className="text-xs text-destructive font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Nenhuma chave configurada. Gere uma chave e salve para ativar a API.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Endpoint */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plug className="w-5 h-5" /> Dados para configurar no CRM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">URL da API</p>
            <p className="text-xs text-muted-foreground">Cole esta URL no campo de endpoint do seu CRM ou agente de IA.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono break-all text-foreground">
                {API_ENDPOINT}
              </code>
              <CopyButton text={API_ENDPOINT} field="endpoint" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Header de autenticação</p>
            <p className="text-xs text-muted-foreground">Configure este header em cada requisição do CRM:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono text-foreground">
                x-api-key: {savedApiKey ? maskedKey : 'SUA_API_KEY'}
              </code>
              {savedApiKey && <CopyButton text={`x-api-key: ${savedApiKey}`} field="header" />}
            </div>
          </div>

          <div className="rounded-lg bg-accent/30 p-4 space-y-1">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> Método: GET
            </p>
            <p className="text-xs text-muted-foreground">
              Esta API é somente leitura. Retorna dados dos pedidos com paginação e filtros avançados.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Exemplo de uso (cURL)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <pre className="bg-muted px-4 py-3 rounded-md text-sm font-mono overflow-x-auto text-foreground whitespace-pre-wrap">
              {exampleCurl}
            </pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={exampleCurl} field="curl" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Filtros disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted px-4 py-3 rounded-md text-xs font-mono overflow-x-auto text-foreground whitespace-pre-wrap">
              {exampleFilters}
            </pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={exampleFilters} field="filters" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Resposta da API</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted px-4 py-3 rounded-md text-xs font-mono overflow-x-auto text-foreground whitespace-pre-wrap">
{`{
  "data": [
    {
      "id": "uuid",
      "customer_name": "João Silva",
      "customer_email": "joao@email.com",
      "product_name": "Produto X",
      "status": "paid",
      "total_value": 199.90,
      "payment_method": "credit_card",
      "coupon_code": "DESC10",
      "created_at": "2025-01-15T10:30:00Z",
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": null
  }
}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsAPI;
