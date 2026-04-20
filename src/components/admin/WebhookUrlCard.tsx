import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Webhook, Copy, AlertCircle } from 'lucide-react';

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
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionSlug}`;

  const copy = () => {
    navigator.clipboard.writeText(url);
    toast({ title: 'URL do webhook copiada!' });
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
      </div>
      {eventos && eventos.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Eventos recomendados: {eventos.map((e, i) => (
            <span key={e}>{i > 0 && ', '}<strong>{e}</strong></span>
          ))}.</span>
        </div>
      )}
    </div>
  );
};

export default WebhookUrlCard;