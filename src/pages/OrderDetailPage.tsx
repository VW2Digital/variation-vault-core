import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, Truck, FileText, AlertCircle, ChevronDown, ChevronUp, CreditCard, QrCode } from 'lucide-react';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; badgeClass?: string }> = {
  PENDING: { label: 'Pendente', variant: 'outline' },
  PAID: { label: 'Pago', variant: 'default', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  RECEIVED: { label: 'Recebido', variant: 'default', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  CONFIRMED: { label: 'Confirmado', variant: 'default', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  OVERDUE: { label: 'Vencido', variant: 'destructive' },
  REFUNDED: { label: 'Estornado', variant: 'secondary' },
  RECEIVED_IN_CASH: { label: 'Recebido em dinheiro', variant: 'default', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  REFUND_REQUESTED: { label: 'Estorno solicitado', variant: 'secondary' },
  CHARGEBACK_REQUESTED: { label: 'Chargeback', variant: 'destructive' },
  CHARGEBACK_DISPUTE: { label: 'Disputa', variant: 'destructive' },
  AWAITING_CHARGEBACK_REVERSAL: { label: 'Aguardando reversão', variant: 'secondary' },
  DUNNING_REQUESTED: { label: 'Cobrança solicitada', variant: 'outline' },
  DUNNING_RECEIVED: { label: 'Cobrança recebida', variant: 'default', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  AWAITING_RISK_ANALYSIS: { label: 'Análise de risco', variant: 'outline' },
  IN_REVIEW: { label: 'Em análise', variant: 'outline', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  DECLINED: { label: 'Recusado', variant: 'destructive' },
  REFUSED: { label: 'Recusado', variant: 'destructive' },
};

const deliveryStatuses = [
  { value: 'PROCESSING', label: 'Processando', badgeClass: '' },
  { value: 'SHIPPED', label: 'Enviado', badgeClass: 'bg-amber-500 hover:bg-amber-600 text-white border-transparent' },
  { value: 'IN_TRANSIT', label: 'Em Trânsito', badgeClass: 'bg-amber-500 hover:bg-amber-600 text-white border-transparent' },
  { value: 'DELIVERED', label: 'Entregue', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  { value: 'RETURNED', label: 'Devolvido', badgeClass: 'bg-red-500 hover:bg-red-600 text-white border-transparent' },
];

const billingTypeMap: Record<string, string> = {
  CREDIT_CARD: 'Cartão de Crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  UNDEFINED: '-',
  credit_card: 'Cartão de Crédito',
  pix: 'PIX',
};

const InfoRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div className="flex justify-between py-1.5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground text-right max-w-[60%] break-words">{value || '-'}</span>
  </div>
);

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shippingLogs, setShippingLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logsCount, setLogsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchOrder = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (error || !data) {
        toast({ title: 'Pedido não encontrado', variant: 'destructive' });
        navigate('/admin/pedidos');
        return;
      }
      setOrder(data);
      setLoading(false);
    };
    const fetchLogsCount = async () => {
      const { count } = await supabase
        .from('shipping_logs')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', id);
      setLogsCount(count ?? 0);
    };
    fetchOrder();
    fetchLogsCount();
  }, [id]);

  const fetchShippingLogs = async () => {
    if (!id) return;
    setLoadingLogs(true);
    const { data } = await supabase
      .from('shipping_logs')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(50);
    setShippingLogs(data || []);
    setLoadingLogs(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) return null;

  const status = statusMap[order.status] || { label: order.status, variant: 'outline' as const };
  const delivery = deliveryStatuses.find(d => d.value === order.delivery_status);

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/pedidos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Detalhes do Pedido</h1>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Cliente</h4>
            <InfoRow label="Nome" value={order.customer_name} />
            <InfoRow label="E-mail" value={order.customer_email} />
            <InfoRow label="Telefone" value={order.customer_phone} />
            <InfoRow label="CPF" value={order.customer_cpf} />
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Produto</h4>
            <InfoRow label="Produto" value={order.product_name} />
            <InfoRow label="Dosagem" value={order.dosage} />
            <InfoRow label="Quantidade" value={order.quantity} />
            <InfoRow label="Preço unitário" value={`R$ ${Number(order.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
            <InfoRow label="Valor total" value={`R$ ${Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
            <InfoRow label="Parcelas" value={order.installments} />
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Pagamento</h4>
            <InfoRow label="Forma" value={billingTypeMap[order.payment_method] || order.payment_method} />
            <InfoRow label="Status" value={(statusMap[order.status] || { label: order.status }).label} />
            <InfoRow label="Gateway" value={order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : 'Asaas'} />
            <InfoRow label="Ambiente" value={order.gateway_environment === 'production' ? 'Producao' : 'Sandbox (Teste)'} />
            {order.asaas_payment_id && <InfoRow label="ID Asaas" value={order.asaas_payment_id} />}
            {order.coupon_code && (
              <>
                <InfoRow label="Cupom" value={order.coupon_code} />
                <InfoRow label="Desconto cupom" value={`R$ ${Number(order.coupon_discount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
              </>
            )}
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Entrega</h4>
            <InfoRow label="Status" value={delivery?.label || 'Processando'} />
            <InfoRow label="Transportadora" value={order.shipping_service} />
            <InfoRow label="Frete" value={order.shipping_cost ? `R$ ${Number(order.shipping_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'} />
            <InfoRow label="Rastreio" value={order.tracking_code} />
            {order.tracking_url && (
              <div className="flex justify-between py-1.5">
                <span className="text-sm text-muted-foreground">Link</span>
                <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                  Rastrear
                </a>
              </div>
            )}
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Endereco</h4>
            <InfoRow label="Rua" value={order.customer_address} />
            <InfoRow label="Numero" value={order.customer_number} />
            <InfoRow label="Complemento" value={order.customer_complement} />
            <InfoRow label="Bairro" value={order.customer_district} />
            <InfoRow label="Cidade" value={order.customer_city} />
            <InfoRow label="Estado" value={order.customer_state} />
            <InfoRow label="CEP" value={order.customer_postal_code} />
          </div>

          {order.status === 'PAID' && !order.tracking_code && order.customer_postal_code && (
            <>
              <Separator />
              <Button
                className="w-full"
                onClick={() => {
                  window.open('https://melhorenvio.com.br/app/carrinho', '_blank');
                  const addr = `${order.customer_name}\n${order.customer_address}, ${order.customer_number}${order.customer_complement ? ` - ${order.customer_complement}` : ''}\n${order.customer_district}\n${order.customer_city} - ${order.customer_state}\nCEP: ${order.customer_postal_code}`;
                  navigator.clipboard.writeText(addr).then(() => {
                    toast({ title: 'Endereco copiado!', description: 'Cole os dados no Melhor Envio.' });
                  });
                }}
              >
                <Truck className="mr-2 h-4 w-4" /> Gerar Etiqueta Manual
              </Button>
            </>
          )}

          <Separator />
          <InfoRow label="Criado em" value={new Date(order.created_at).toLocaleString('pt-BR')} />
          <InfoRow label="Atualizado em" value={new Date(order.updated_at).toLocaleString('pt-BR')} />

          <Separator />
          <div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => {
                if (!showLogs) {
                  setShowLogs(true);
                  fetchShippingLogs();
                } else {
                  setShowLogs(false);
                }
              }}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Historico Tecnico do Frete
              </span>
              {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showLogs && (
              <div className="mt-3 space-y-2 max-h-[400px] overflow-y-auto">
                {loadingLogs ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : shippingLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Nenhum registro de frete encontrado.</p>
                ) : (
                  shippingLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`rounded-md border p-2.5 text-xs space-y-1 ${
                        log.event_type === 'error' || log.error_message
                          ? 'border-destructive/30 bg-destructive/5'
                          : 'border-border/50 bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground flex items-center gap-1">
                          {(log.event_type === 'error' || log.error_message) && (
                            <AlertCircle className="h-3 w-3 text-destructive" />
                          )}
                          {log.event_type || 'evento'}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                      {log.error_message && (
                        <p className="text-destructive break-words">{log.error_message}</p>
                      )}
                      {log.request_payload && (
                        <details className="text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">Request</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] bg-background rounded p-1.5 max-h-[120px] overflow-auto">
                            {JSON.stringify(log.request_payload, null, 2)}
                          </pre>
                        </details>
                      )}
                      {log.response_payload && (
                        <details className="text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground">Response</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] bg-background rounded p-1.5 max-h-[120px] overflow-auto">
                            {JSON.stringify(log.response_payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderDetailPage;
