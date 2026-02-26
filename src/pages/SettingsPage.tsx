import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Phone, CreditCard, Eye, EyeOff } from 'lucide-react';
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
  const [asaasEnv, setAsaasEnv] = useState('sandbox');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchSetting('whatsapp_number'),
      fetchSetting('asaas_api_key'),
      fetchSetting('asaas_environment'),
    ]).then(([wp, apiKey, env]) => {
      setWhatsapp(wp);
      setAsaasApiKey(apiKey);
      setAsaasEnv(env || 'sandbox');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsertSetting('whatsapp_number', whatsapp),
        upsertSetting('asaas_api_key', asaasApiKey),
        upsertSetting('asaas_environment', asaasEnv),
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
    <div className="space-y-6 w-full max-w-2xl">
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
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="5511999999999"
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
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  );
};

export default SettingsPage;
