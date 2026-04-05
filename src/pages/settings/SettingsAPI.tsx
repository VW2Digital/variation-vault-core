import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Plug, Copy, Check, ExternalLink } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_ENDPOINT = `${SUPABASE_URL}/functions/v1/orders-api`;

const SettingsAPI = () => {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const exampleCurl = `curl -X GET "${API_ENDPOINT}?status=paid&per_page=10" \\
  -H "x-api-key: SUA_API_KEY"`;

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

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plug className="w-5 h-5" /> Endpoint da API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">URL base para consultar pedidos. Use este endpoint no seu CRM ou agente de IA.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono break-all text-foreground">
                {API_ENDPOINT}
              </code>
              <CopyButton text={API_ENDPOINT} field="endpoint" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Header de autenticação</p>
            <p className="text-xs text-muted-foreground">Envie sua API Key no header de cada requisição:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono text-foreground">
                x-api-key: SUA_API_KEY
              </code>
              <CopyButton text="x-api-key: SUA_API_KEY" field="header" />
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
