import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchSetting, upsertSetting } from '@/lib/api';
import { Globe, Save, AlertCircle, Loader2 } from 'lucide-react';
import { usePublicBaseUrl } from '@/hooks/usePublicBaseUrl';

/**
 * Card de configuração da URL pública canônica da loja.
 *
 * Esta URL é usada para montar:
 *   - URL de redirecionamento do OAuth (Melhor Envio)
 *   - URLs públicas de webhooks (proxy Nginx → Edge Functions)
 *   - Qualquer link colado em painel externo (Stripe, n8n, etc.)
 *
 * Sem isso configurado, no preview do Lovable as URLs sairiam com o host
 * interno (`*.lovableproject.com`), que é rejeitado pelos gateways.
 */
const PublicSiteUrlCard = () => {
  const { toast } = useToast();
  const { publicUrl, configuredByAdmin, browserIsInternal } = usePublicBaseUrl();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchSetting('public_site_url').then((v) => {
      setValue(v || '');
      setLoaded(true);
    });
  }, []);

  const normalize = (raw: string): string | null => {
    const v = raw.trim().replace(/\/+$/, '');
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) return null;
    try {
      const u = new URL(v);
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  };

  const save = async () => {
    const normalized = normalize(value);
    if (normalized === null) {
      toast({
        title: 'URL inválida',
        description: 'Use o formato https://seudominio.com',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await upsertSetting('public_site_url', normalized);
      setValue(normalized);
      toast({
        title: 'URL pública salva',
        description: 'Webhooks e OAuth redirect usarão esta URL.',
      });
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5" /> URL pública da loja
        </CardTitle>
        <CardDescription>
          Domínio definitivo da sua loja em produção (ex.: <code className="font-mono">https://store.pharmaliberty.com</code>).
          Usado para gerar URLs corretas de webhooks e OAuth redirect — não use o domínio do preview.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="public-site-url" className="text-sm">URL pública (com https://)</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="public-site-url"
              placeholder="https://store.pharmaliberty.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!loaded}
              className="font-mono text-sm"
            />
            <Button onClick={save} disabled={saving || !loaded} className="gap-2 shrink-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
          </div>
        </div>

        {browserIsInternal && !configuredByAdmin && (
          <div className="flex items-start gap-2 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Você está acessando pelo domínio interno do Lovable. Configure a URL pública acima
              para que os webhooks e OAuth redirect mostrem o endereço real da sua loja em produção.
            </span>
          </div>
        )}

        {publicUrl && (
          <div className="text-xs text-muted-foreground">
            URL ativa: <code className="font-mono break-all text-foreground">{publicUrl}</code>
            {configuredByAdmin && <span className="ml-1 text-primary">(configurada pelo admin)</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PublicSiteUrlCard;