import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Webhook, Copy, AlertCircle, Loader2, CheckCircle2, XCircle, Activity } from 'lucide-react';

interface WebhookUrlCardProps {
  /** Nome do gateway, exibido no título (ex.: "Asaas", "Mercado Pago") */
  gatewayName: string;
  /** Slug da edge function (ex.: "asaas-webhook", "mercadopago-webhook") */
  functionSlug: string;
  /** Texto opcional sobre o local de cadastro no painel do gateway */
  cadastroHint?: string;
  /** Lista opcional de eventos recomendados */
  eventos?: string[];
}

/**
 * Card destacado que exibe a URL pronta do webhook no Supabase
 * para evitar que o usuário tente cadastrar a URL do domínio próprio
 * (o que costuma retornar 405 e bloquear o cadastro no gateway).
 */
const WebhookUrlCard = ({ gatewayName, functionSlug, cadastroHint, eventos }: WebhookUrlCardProps) => {
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState<string>(import.meta.env.VITE_SUPABASE_URL as string);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ status: number; ok: boolean; latencyMs: number; error?: string } | null>(null);

  // Override em runtime: lê site_settings.supabase_url_override se existir.
  // Útil quando o build foi gerado com VITE_SUPABASE_URL errado (ex.: VPS com .env de exemplo).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'supabase_url_override')
        .maybeSingle();
      if (!cancelled && data?.value && /^https?:\/\//.test(data.value)) {
        setBaseUrl(data.value.replace(/\/+$/, ''));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const url = `${baseUrl}/functions/v1/${functionSlug}`;
  const buildUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const mismatch = baseUrl && buildUrl && baseUrl !== buildUrl;

  const copy = () => {
    navigator.clipboard.writeText(url);
    toast({ title: 'URL do webhook copiada!' });
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    const start = performance.now();
    try {
      // GET simples — todas as nossas edge functions de webhook devem responder 200 ao GET
      const res = await fetch(url, { method: 'GET' });
      await res.text(); // consome o body para evitar leak
      const latencyMs = Math.round(performance.now() - start);
      const ok = res.status >= 200 && res.status < 300;
      setResult({ status: res.status, ok, latencyMs });
      toast({
        title: ok ? `Webhook respondeu ${res.status} OK` : `Webhook retornou ${res.status}`,
        description: `Latência: ${latencyMs}ms`,
        variant: ok ? 'default' : 'destructive',
      });
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      setResult({ status: 0, ok: false, latencyMs, error: err?.message || 'Erro de rede' });
      toast({
        title: 'Falha ao contatar o webhook',
        description: err?.message || 'Erro de rede',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Webhook className="w-4 h-4 text-primary" />
        <Label className="text-sm font-semibold">URL do Webhook ({gatewayName})</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Cole esta URL exata {cadastroHint ?? `no painel do ${gatewayName}, em Configurações → Webhooks`}.
        Não use o domínio da loja — use sempre o endpoint abaixo para evitar erros de validação (ex.: status 405).
      </p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          className="bg-background text-xs font-mono"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          <Copy className="w-4 h-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={test} disabled={testing} className="shrink-0 gap-1">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          Testar
        </Button>
      </div>
      {result && (
        <div
          className={`flex items-start gap-2 text-xs rounded-md border p-2 ${
            result.ok
              ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          )}
          <span>
            {result.error
              ? <>Falha de rede: <strong>{result.error}</strong>. Verifique se o domínio está acessível.</>
              : <>Status HTTP <strong>{result.status}</strong> — {result.ok ? 'endpoint respondeu corretamente' : 'endpoint não está respondendo como esperado'} ({result.latencyMs}ms)</>}
          </span>
        </div>
      )}
      {eventos && eventos.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Eventos recomendados: {eventos.map((e, i) => (
            <span key={e}>{i > 0 && ', '}<strong>{e}</strong></span>
          ))}.</span>
        </div>
      )}
      {mismatch && (
        <div className="flex items-start gap-2 text-xs rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            URL sobrescrita via <strong>site_settings.supabase_url_override</strong> (build apontava para <code className="break-all">{buildUrl}</code>).
          </span>
        </div>
      )}
    </div>
  );
};

export default WebhookUrlCard;