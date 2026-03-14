import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Receipt, Loader2, Truck, Save, RotateCw, MoreVertical, Eye, Pencil, Trash2, X, ChevronLeft, ChevronRight, Search, CheckSquare } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pendente', variant: 'outline' },
  PAID: { label: 'Pago', variant: 'default' },
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
  const [saving, setSaving] = useState(false);
  const [refreshingTracking, setRefreshingTracking] = useState<string | null>(null);
  const [filterPayment, setFilterPayment] = useState('ALL');
  const [filterDelivery, setFilterDelivery] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;
  // Dialog states
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showBatchDelete, setShowBatchDelete] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_cpf: '',
    product_name: '',
    dosage: '',
    quantity: 1,
    unit_price: 0,
    total_value: 0,
    payment_method: 'pix',
    status: 'PENDING',
    delivery_status: 'PROCESSING',
    tracking_code: '',
    customer_address: '',
    customer_number: '',
    customer_complement: '',
    customer_district: '',
    customer_city: '',
    customer_state: '',
    customer_postal_code: '',
    shipping_cost: 0,
    shipping_service: '',
  });

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

  useEffect(() => { fetchOrders(); }, []);

  const openEdit = (order: any) => {
    setEditForm({
      customer_name: order.customer_name || '',
      customer_email: order.customer_email || '',
      customer_phone: order.customer_phone || '',
      customer_cpf: order.customer_cpf || '',
      product_name: order.product_name || '',
      dosage: order.dosage || '',
      quantity: order.quantity || 1,
      unit_price: Number(order.unit_price) || 0,
      total_value: Number(order.total_value) || 0,
      payment_method: order.payment_method || 'pix',
      status: order.status || 'PENDING',
      delivery_status: order.delivery_status || 'PROCESSING',
      tracking_code: order.tracking_code || '',
      customer_address: order.customer_address || '',
      customer_number: order.customer_number || '',
      customer_complement: order.customer_complement || '',
      customer_district: order.customer_district || '',
      customer_city: order.customer_city || '',
      customer_state: order.customer_state || '',
      customer_postal_code: order.customer_postal_code || '',
      shipping_cost: Number(order.shipping_cost) || 0,
      shipping_service: order.shipping_service || '',
    });
    setEditOrder(order);
  };

  const saveEdit = async () => {
    if (!editOrder) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          customer_name: editForm.customer_name,
          customer_email: editForm.customer_email,
          customer_phone: editForm.customer_phone,
          customer_cpf: editForm.customer_cpf,
          product_name: editForm.product_name,
          dosage: editForm.dosage || null,
          quantity: editForm.quantity,
          unit_price: editForm.unit_price,
          total_value: editForm.total_value,
          payment_method: editForm.payment_method,
          status: editForm.status,
          delivery_status: editForm.delivery_status,
          tracking_code: editForm.tracking_code || null,
          customer_address: editForm.customer_address || null,
          customer_number: editForm.customer_number || null,
          customer_complement: editForm.customer_complement || null,
          customer_district: editForm.customer_district || null,
          customer_city: editForm.customer_city || null,
          customer_state: editForm.customer_state || null,
          customer_postal_code: editForm.customer_postal_code || null,
          shipping_cost: editForm.shipping_cost,
          shipping_service: editForm.shipping_service || null,
        } as any)
        .eq('id', editOrder.id);
      if (error) throw error;
      toast({ title: 'Pedido atualizado!' });
      setEditOrder(null);
      fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Pedido excluído!' });
      fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = paginatedOrders.map(o => o.id);
    const allSelected = pageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      pageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const batchUpdateStatus = async (field: 'status' | 'delivery_status', value: string) => {
    if (selectedIds.size === 0) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from('orders')
        .update({ [field]: value } as any)
        .in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} pedido(s) atualizado(s)!` });
      setSelectedIds(new Set());
      fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar em lote', description: err.message, variant: 'destructive' });
    } finally {
      setBatchUpdating(false);
    }
  };

  const batchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('orders').delete().in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} pedido(s) excluído(s)!` });
      setSelectedIds(new Set());
      setShowBatchDelete(false);
      fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro ao excluir em lote', description: err.message, variant: 'destructive' });
    } finally {
      setBatchDeleting(false);
    }
  };

  const refreshTracking = async (orderId: string) => {
    setRefreshingTracking(orderId);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-shipment', {
        body: { action: 'refresh_tracking', order_id: orderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.tracking_code) {
        toast({ title: 'Rastreio atualizado!', description: `Código: ${data.tracking_code}` });
      } else {
        toast({ title: 'Rastreio consultado', description: `Status: ${data?.status || 'desconhecido'}` });
      }
      if (data?.updated) fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar rastreio', description: err.message, variant: 'destructive' });
    } finally {
      setRefreshingTracking(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filterPayment !== 'ALL' && order.status !== filterPayment) return false;
    if (filterDelivery !== 'ALL' && (order.delivery_status || 'PROCESSING') !== filterDelivery) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = (order.customer_name || '').toLowerCase().includes(q);
      const productMatch = (order.product_name || '').toLowerCase().includes(q);
      if (!nameMatch && !productMatch) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedOrders = filteredOrders.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // Reset page when filters or search change
  useEffect(() => { setCurrentPage(1); }, [filterPayment, filterDelivery, searchQuery]);

  const InfoRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%] break-words">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente ou produto..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 w-[250px]"
          />
        </div>
        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os pagamentos</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="PAID">Pago</SelectItem>
            <SelectItem value="CONFIRMED">Confirmado</SelectItem>
            <SelectItem value="RECEIVED">Recebido</SelectItem>
            <SelectItem value="OVERDUE">Vencido</SelectItem>
            <SelectItem value="REFUNDED">Estornado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDelivery} onValueChange={setFilterDelivery}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Entrega" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as entregas</SelectItem>
            {deliveryStatuses.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Receipt className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <>
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
                    <TableHead>Rastreio</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => {
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
                          <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.delivery_status === 'DELIVERED' ? 'default' : 'outline'} className="text-[10px]">
                            {delivery?.label || 'Processando'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {order.tracking_code ? (
                              <span className="font-mono text-xs text-foreground">{order.tracking_code}</span>
                            ) : order.shipment_id ? (
                              <span className="text-xs text-muted-foreground italic">Pendente</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                            {order.shipment_id && !order.tracking_code && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                                onClick={() => refreshTracking(order.id)}
                                disabled={refreshingTracking === order.id}>
                                <RotateCw className={`w-3 h-3 ${refreshingTracking === order.id ? 'animate-spin' : ''}`} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewOrder(order)}>
                                <Eye className="mr-2 h-4 w-4" /> Visualizar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(order)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(order)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {((safePage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(safePage * ITEMS_PER_PAGE, filteredOrders.length)} de {filteredOrders.length} pedidos
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`dots-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                    ) : (
                      <Button key={p} variant={p === safePage ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs" onClick={() => setCurrentPage(p)}>
                        {p}
                      </Button>
                    )
                  )}
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* View Order Dialog */}
      <Dialog open={!!viewOrder} onOpenChange={(open) => !open && setViewOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Pedido</DialogTitle>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Cliente</h4>
                <InfoRow label="Nome" value={viewOrder.customer_name} />
                <InfoRow label="E-mail" value={viewOrder.customer_email} />
                <InfoRow label="Telefone" value={viewOrder.customer_phone} />
                <InfoRow label="CPF" value={viewOrder.customer_cpf} />
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Produto</h4>
                <InfoRow label="Produto" value={viewOrder.product_name} />
                <InfoRow label="Dosagem" value={viewOrder.dosage} />
                <InfoRow label="Quantidade" value={viewOrder.quantity} />
                <InfoRow label="Preço unitário" value={`R$ ${Number(viewOrder.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <InfoRow label="Valor total" value={`R$ ${Number(viewOrder.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <InfoRow label="Parcelas" value={viewOrder.installments} />
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Pagamento</h4>
                <InfoRow label="Forma" value={billingTypeMap[viewOrder.payment_method] || viewOrder.payment_method} />
                <InfoRow label="Status" value={(statusMap[viewOrder.status] || { label: viewOrder.status }).label} />
                {viewOrder.asaas_payment_id && <InfoRow label="ID Asaas" value={viewOrder.asaas_payment_id} />}
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Entrega</h4>
                <InfoRow label="Status" value={deliveryStatuses.find(d => d.value === viewOrder.delivery_status)?.label || 'Processando'} />
                <InfoRow label="Transportadora" value={viewOrder.shipping_service} />
                <InfoRow label="Frete" value={viewOrder.shipping_cost ? `R$ ${Number(viewOrder.shipping_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'} />
                <InfoRow label="Rastreio" value={viewOrder.tracking_code} />
                {viewOrder.tracking_url && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-sm text-muted-foreground">Link</span>
                    <a href={viewOrder.tracking_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                      Rastrear
                    </a>
                  </div>
                )}
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Endereço</h4>
                <InfoRow label="Rua" value={viewOrder.customer_address} />
                <InfoRow label="Número" value={viewOrder.customer_number} />
                <InfoRow label="Complemento" value={viewOrder.customer_complement} />
                <InfoRow label="Bairro" value={viewOrder.customer_district} />
                <InfoRow label="Cidade" value={viewOrder.customer_city} />
                <InfoRow label="Estado" value={viewOrder.customer_state} />
                <InfoRow label="CEP" value={viewOrder.customer_postal_code} />
              </div>
              <Separator />
              <InfoRow label="Criado em" value={new Date(viewOrder.created_at).toLocaleString('pt-BR')} />
              <InfoRow label="Atualizado em" value={new Date(viewOrder.updated_at).toLocaleString('pt-BR')} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={!!editOrder} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Pedido</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Nome do Cliente</Label>
              <Input value={editForm.customer_name} onChange={(e) => setEditForm(f => ({ ...f, customer_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input value={editForm.customer_email} onChange={(e) => setEditForm(f => ({ ...f, customer_email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone</Label>
              <Input value={editForm.customer_phone} onChange={(e) => setEditForm(f => ({ ...f, customer_phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPF</Label>
              <Input value={editForm.customer_cpf} onChange={(e) => setEditForm(f => ({ ...f, customer_cpf: e.target.value }))} />
            </div>

            <Separator className="col-span-full" />

            <div className="space-y-1">
              <Label className="text-xs">Produto</Label>
              <Input value={editForm.product_name} onChange={(e) => setEditForm(f => ({ ...f, product_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dosagem</Label>
              <Input value={editForm.dosage} onChange={(e) => setEditForm(f => ({ ...f, dosage: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quantidade</Label>
              <Input type="number" min={1} value={editForm.quantity} onChange={(e) => setEditForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Preço Unitário</Label>
              <Input type="number" step="0.01" value={editForm.unit_price} onChange={(e) => setEditForm(f => ({ ...f, unit_price: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor Total</Label>
              <Input type="number" step="0.01" value={editForm.total_value} onChange={(e) => setEditForm(f => ({ ...f, total_value: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Frete</Label>
              <Input type="number" step="0.01" value={editForm.shipping_cost} onChange={(e) => setEditForm(f => ({ ...f, shipping_cost: Number(e.target.value) }))} />
            </div>

            <Separator className="col-span-full" />

            <div className="space-y-1">
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select value={editForm.payment_method} onValueChange={(v) => setEditForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status Pagamento</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusMap).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status Entrega</Label>
              <Select value={editForm.delivery_status} onValueChange={(v) => setEditForm(f => ({ ...f, delivery_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {deliveryStatuses.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Código de Rastreio</Label>
              <Input value={editForm.tracking_code} onChange={(e) => setEditForm(f => ({ ...f, tracking_code: e.target.value }))} placeholder="Ex: BR123456789BR" />
            </div>

            <Separator className="col-span-full" />

            <div className="space-y-1">
              <Label className="text-xs">Rua</Label>
              <Input value={editForm.customer_address} onChange={(e) => setEditForm(f => ({ ...f, customer_address: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Número</Label>
              <Input value={editForm.customer_number} onChange={(e) => setEditForm(f => ({ ...f, customer_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Complemento</Label>
              <Input value={editForm.customer_complement} onChange={(e) => setEditForm(f => ({ ...f, customer_complement: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bairro</Label>
              <Input value={editForm.customer_district} onChange={(e) => setEditForm(f => ({ ...f, customer_district: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cidade</Label>
              <Input value={editForm.customer_city} onChange={(e) => setEditForm(f => ({ ...f, customer_city: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Input value={editForm.customer_state} onChange={(e) => setEditForm(f => ({ ...f, customer_state: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CEP</Label>
              <Input value={editForm.customer_postal_code} onChange={(e) => setEditForm(f => ({ ...f, customer_postal_code: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Transportadora</Label>
              <Input value={editForm.shipping_service} onChange={(e) => setEditForm(f => ({ ...f, shipping_service: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditOrder(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido de "{deleteTarget?.customer_name}" ({deleteTarget?.product_name}) será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) handleDelete(deleteTarget.id); setDeleteTarget(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrdersPage;