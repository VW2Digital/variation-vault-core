import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Receipt, Loader2, Truck, Save } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pendente', variant: 'outline' },
  RECEIVED: { label: 'Recebido', variant: 'default' },
  CONFIRMED: { label: 'Confirmado', variant: 'default' },
  OVERDUE: { label: 'Vencido', variant: 'destructive' },
  REFUNDED: { label: 'Estornado', variant: 'secondary' },
  RECEIVED_IN_CASH: { label: 'Recebido em dinheiro', variant: 'default' },
  REFUND_REQUESTED: { label: 'Estorno solicitado', variant: 'secondary' },
  CHARGEBACK_REQUESTED: { label: 'Chargeback', variant: 'destructive' },
  CHARGEBACK_DISPUTE: { label: 'Disputa', variant: 'destructive' },
  AWAITING_CHARGEBACK_REVERSAL: { label: 'Aguardando reversão', variant: 'secondary' },
  DUNNING_REQUESTED: { label: 'Cobrança solicitada', variant: 'outline' },
  DUNNING_RECEIVED: { label: 'Cobrança recebida', variant: 'default' },
  AWAITING_RISK_ANALYSIS: { label: 'Análise de risco', variant: 'outline' },
};

const deliveryStatuses = [
  { value: 'PROCESSING', label: 'Em Processamento' },
  { value: 'SHIPPED', label: 'Enviado' },
  { value: 'IN_TRANSIT', label: 'Em Trânsito' },
  { value: 'DELIVERED', label: 'Entregue' },
  { value: 'RETURNED', label: 'Devolvido' },
];

const billingTypeMap: Record<string, string> = {
  CREDIT_CARD: 'Cartão de Crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  UNDEFINED: '-',
  credit_card: 'Cartão de Crédito',
  pix: 'PIX',
};

const OrdersPage = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [trackingCode, setTrackingCode] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('PROCESSING');
  const [saving, setSaving] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar pedidos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openTrackingDialog = (order: any) => {
    setEditingOrder(order);
    setTrackingCode(order.tracking_code || '');
    setDeliveryStatus(order.delivery_status || 'PROCESSING');
  };

  const saveTracking = async () => {
    if (!editingOrder) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          tracking_code: trackingCode || null,
          delivery_status: deliveryStatus,
        } as any)
        .eq('id', editingOrder.id);
      if (error) throw error;
      toast({ title: 'Rastreio atualizado!' });
      setEditingOrder(null);
      fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Receipt className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const status = statusMap[order.status] || { label: order.status, variant: 'outline' as const };
                  const delivery = deliveryStatuses.find(d => d.value === order.delivery_status);
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-sm font-medium max-w-[150px] truncate">
                        {order.customer_name || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {order.product_name} {order.dosage ? `- ${order.dosage}` : ''}
                      </TableCell>
                      <TableCell className="text-xs">
                        {billingTypeMap[order.payment_method] || order.payment_method}
                      </TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">
                        R$ {Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={order.delivery_status === 'DELIVERED' ? 'default' : 'outline'}
                          className="text-[10px]"
                        >
                          {delivery?.label || 'Processando'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => openTrackingDialog(order)}>
                              <Truck className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Rastreio & Entrega</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-2">
                              <div className="text-sm text-muted-foreground">
                                <strong>{order.customer_name}</strong> — {order.product_name}
                              </div>
                              <div className="space-y-2">
                                <Label>Código de Rastreio</Label>
                                <Input
                                  placeholder="Ex: BR123456789BR"
                                  value={trackingCode}
                                  onChange={(e) => setTrackingCode(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Status da Entrega</Label>
                                <Select value={deliveryStatus} onValueChange={setDeliveryStatus}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {deliveryStatuses.map(s => (
                                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button onClick={saveTracking} disabled={saving} className="w-full">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Salvar
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OrdersPage;
