import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Receipt, Loader2, Truck, Save, RotateCw, MoreVertical, Eye, Pencil, Trash2, X, ChevronLeft, ChevronRight, Search, CheckSquare, MessageSquare, Send, FileText, AlertCircle, ChevronDown, ChevronUp, Star, Link as LinkIcon, CreditCard, QrCode, Ticket } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';

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

const PaymentIcon = ({ method, size = 16 }: { method: string; size?: number }) => {
  const m = method?.toLowerCase();
  const label = billingTypeMap[method] || method;
  if (m === 'pix') return <span title={label}><QrCode className="text-teal-600 cursor-help" size={size} /></span>;
  if (m === 'credit_card') return <span title={label}><CreditCard className="text-amber-600 cursor-help" size={size} /></span>;
  return <span className="text-xs text-muted-foreground">{label}</span>;
};

const whatsappTemplates = [
  { id: 'greeting', label: '👋 Saudação', getMessage: (name: string, product: string) => `Olá ${name}! Tudo bem? Entramos em contato sobre o seu pedido "${product}".` },
  { id: 'confirmed', label: '✅ Pedido Confirmado', getMessage: (name: string, product: string) => `Olá ${name}! ✅ Seu pedido "${product}" foi *confirmado* com sucesso! Em breve iniciaremos o preparo para envio. Obrigado pela confiança!` },
  { id: 'preparing', label: '📋 Em Preparação', getMessage: (name: string, product: string) => `Olá ${name}! 📋 Seu pedido "${product}" está sendo *preparado* para envio. Assim que for despachado, você receberá o código de rastreio. 😊` },
  { id: 'shipped', label: '🚚 Pedido Enviado', getMessage: (name: string, product: string) => `Olá ${name}! 🚚 Ótima notícia! Seu pedido "${product}" foi *enviado*! Você receberá o código de rastreio em breve. Qualquer dúvida, estamos à disposição!` },
  { id: 'tracking', label: '📦 Código de Rastreio', getMessage: (name: string, product: string, tracking?: string) => `Olá ${name}! 📦 Seu pedido "${product}" já está a caminho! Código de rastreio: *${tracking || '[código]'}*. Acompanhe pelo site dos Correios/transportadora. 😊` },
  { id: 'delivered', label: '🎉 Entregue', getMessage: (name: string, product: string) => `Olá ${name}! 🎉 Seu pedido "${product}" foi *entregue*! Esperamos que goste. Se precisar de algo, estamos à disposição. Obrigado por comprar conosco! ⭐` },
  { id: 'payment_pending', label: '💳 Pagamento Pendente', getMessage: (name: string, product: string) => `Olá ${name}! 💳 Notamos que o pagamento do seu pedido "${product}" ainda está *pendente*. Precisa de ajuda? Estamos aqui para te auxiliar!` },
  { id: 'thanks', label: '🙏 Agradecimento', getMessage: (name: string, product: string) => `Olá ${name}! 🙏 Agradecemos pela sua compra de "${product}"! Sua satisfação é muito importante para nós. Qualquer dúvida, estamos à disposição!` },
];

const OrdersPage = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingTracking, setRefreshingTracking] = useState<string | null>(null);
  const [retryingShipping, setRetryingShipping] = useState<string | null>(null);
  const [batchRefreshing, setBatchRefreshing] = useState(false);
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
  const [batchDeleteConfirmText, setBatchDeleteConfirmText] = useState('');

  // WhatsApp message dialog
  const [whatsappOrder, setWhatsappOrder] = useState<any>(null);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  // Shipping logs
  const [shippingLogs, setShippingLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

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

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchShippingLogs = async (orderId: string) => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('shipping_logs')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setShippingLogs(data || []);
    } catch (err: any) {
      console.error('Error fetching shipping logs:', err);
      setShippingLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const openViewOrder = (order: any) => {
    setViewOrder(order);
    setShowLogs(false);
    setShippingLogs([]);
  };

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

      // Auto-send WhatsApp on status change
      const phone = editForm.customer_phone;
      if (phone) {
        const statusChanged = editOrder.status !== editForm.status;
        const deliveryChanged = (editOrder.delivery_status || 'PROCESSING') !== editForm.delivery_status;
        try {
          if (deliveryChanged) {
            const msg = getStatusChangeMessage(editForm.customer_name, editForm.product_name, 'delivery_status', editForm.delivery_status);
            await sendWhatsappMessage(phone, msg);
            toast({ title: 'Notificação WhatsApp enviada (entrega)!' });
          }
          if (statusChanged) {
            const msg = getStatusChangeMessage(editForm.customer_name, editForm.product_name, 'status', editForm.status);
            await sendWhatsappMessage(phone, msg);
            toast({ title: 'Notificação WhatsApp enviada (pagamento)!' });
          }
        } catch (whatsErr: any) {
          toast({ title: 'Pedido salvo, mas falha no WhatsApp', description: whatsErr.message, variant: 'destructive' });
        }
      }

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

  const batchRefreshTracking = async () => {
    setBatchRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-shipment', {
        body: { action: 'batch_refresh_tracking' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const found = (data?.results || []).filter((r: any) => r.tracking_code).length;
      const total = data?.processed || 0;
      toast({ 
        title: 'Busca em lote concluída', 
        description: `${total} pedido(s) verificado(s), ${found} rastreio(s) encontrado(s).` 
      });
      if (found > 0) fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro na busca em lote', description: err.message, variant: 'destructive' });
    } finally {
      setBatchRefreshing(false);
    }
  };

  const retryShipping = async (orderId: string) => {
    setRetryingShipping(orderId);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-shipment', {
        body: { action: 'full_flow', order_id: orderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Etiqueta gerada com sucesso!', description: data?.tracking_code ? `Rastreio: ${data.tracking_code}` : 'Rastreio será atualizado em breve.' });
      fetchOrders();
    } catch (err: any) {
      toast({ title: 'Erro ao gerar etiqueta', description: err.message, variant: 'destructive' });
    } finally {
      setRetryingShipping(null);
    }
  };


  const getStatusChangeMessage = (orderName: string, productName: string, field: string, newValue: string) => {
    const deliveryLabels: Record<string, string> = {
      PROCESSING: 'Em Processamento',
      SHIPPED: 'Enviado',
      IN_TRANSIT: 'Em Trânsito',
      DELIVERED: 'Entregue',
      RETURNED: 'Devolvido',
    };
    const paymentLabels: Record<string, string> = Object.fromEntries(
      Object.entries(statusMap).map(([k, v]) => [k, v.label])
    );

    if (field === 'delivery_status') {
      const label = deliveryLabels[newValue] || newValue;
      return `Olá ${orderName}! 📦 Seu pedido "${productName}" teve o status de entrega atualizado para: *${label}*. Obrigado por comprar conosco!`;
    }
    const label = paymentLabels[newValue] || newValue;
    return `Olá ${orderName}! 💳 Seu pedido "${productName}" teve o status de pagamento atualizado para: *${label}*. Obrigado!`;
  };

  const sendWhatsappMessage = async (number: string, text: string) => {
    if (!number || !text) throw new Error('Número e mensagem são obrigatórios');
    const { data, error } = await supabase.functions.invoke('evolution-send-message', {
      body: { number: number.replace(/\D/g, ''), text },
    });
    if (error) throw new Error(error.message || 'Erro ao chamar a função de envio');
    if (data?.error) throw new Error(data.error);
    if (!data?.success) throw new Error('Resposta inesperada da API. Verifique as configurações da Evolution API.');
    return data;
  };

  const handleSendWhatsapp = async () => {
    if (!whatsappOrder || !whatsappMessage.trim() || !whatsappNumber.trim()) return;
    setSendingWhatsapp(true);
    try {
      await sendWhatsappMessage(whatsappNumber, whatsappMessage);
      toast({ title: 'Mensagem enviada via WhatsApp!' });
      setWhatsappOrder(null);
      setWhatsappMessage('');
      setWhatsappNumber('');
    } catch (err: any) {
      toast({ title: 'Erro ao enviar WhatsApp', description: err.message, variant: 'destructive' });
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const openWhatsappDialog = (order: any) => {
    setWhatsappOrder(order);
    // Ensure number has country code - if it doesn't start with a valid prefix, prepend 55 (Brazil)
    const rawPhone = (order.customer_phone || '').replace(/\D/g, '');
    const formattedPhone = rawPhone.length <= 11 ? `55${rawPhone.replace(/^0+/, '')}` : rawPhone;
    setWhatsappNumber(formattedPhone);
    setWhatsappMessage('');
  };

  const applyTemplate = (templateId: string) => {
    if (!whatsappOrder) return;
    const tpl = whatsappTemplates.find(t => t.id === templateId);
    if (tpl) {
      setWhatsappMessage(tpl.getMessage(whatsappOrder.customer_name, whatsappOrder.product_name, whatsappOrder.tracking_code));
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filterPayment !== 'ALL' && order.status !== filterPayment) return false;
    if (filterDelivery !== 'ALL' && (order.delivery_status || 'PROCESSING') !== filterDelivery) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = (order.customer_name || '').toLowerCase().includes(q);
      const productMatch = (order.product_name || '').toLowerCase().includes(q);
      const trackingMatch = (order.tracking_code || '').toLowerCase().includes(q);
      if (!nameMatch && !productMatch && !trackingMatch) return false;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pedidos</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={batchRefreshTracking} disabled={batchRefreshing}>
            {batchRefreshing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Truck className="w-4 h-4 mr-1" />}
            <span className="hidden sm:inline">Buscar Rastreios</span>
            <span className="sm:hidden">Rastreios</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente, produto ou rastreio..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 w-full sm:w-[250px]"
          />
        </div>
        <div className="flex gap-2 flex-1 sm:flex-none">
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="flex-1 sm:w-[180px]">
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
            <SelectTrigger className="flex-1 sm:w-[180px]">
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
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium text-foreground">
            <CheckSquare className="inline h-4 w-4 mr-1" />
            {selectedIds.size} selecionado(s)
          </span>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Pagamento:</span>
            <Select onValueChange={(v) => batchUpdateStatus('status', v)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Alterar status" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusMap).slice(0, 6).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Entrega:</span>
            <Select onValueChange={(v) => batchUpdateStatus('delivery_status', v)}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Alterar entrega" />
              </SelectTrigger>
              <SelectContent>
                {deliveryStatuses.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => setShowBatchDelete(true)} disabled={batchDeleting}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
          {batchUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}

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
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {paginatedOrders.map((order) => {
              const status = statusMap[order.status] || { label: order.status, variant: 'outline' as const, badgeClass: '' };
              const delivery = deliveryStatuses.find(d => d.value === order.delivery_status);
              return (
                <Card key={order.id} className={`border-border/50 ${selectedIds.has(order.id) ? 'ring-1 ring-primary' : ''}`}>
                  <CardContent className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Checkbox
                          checked={selectedIds.has(order.id)}
                          onCheckedChange={() => toggleSelect(order.id)}
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-foreground truncate uppercase">{order.customer_name || '-'}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openViewOrder(order)}>
                            <Eye className="mr-2 h-4 w-4" /> Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(order)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => refreshTracking(order.id)} disabled={refreshingTracking === order.id}>
                            {refreshingTracking === order.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                            Buscar Rastreio
                          </DropdownMenuItem>
                          {order.customer_phone && (
                            <DropdownMenuItem onClick={() => openWhatsappDialog(order)}>
                              <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => {
                            const url = `${window.location.origin}/minha-conta?tab=reviews&order=${order.id}`;
                            navigator.clipboard.writeText(url);
                            toast({ title: 'Link de avaliação copiado!' });
                          }}>
                            <Star className="mr-2 h-4 w-4" /> Link de Avaliação
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(order)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-xs text-muted-foreground truncate pl-7">{order.product_name}{order.dosage ? ` - ${order.dosage}` : ''}</p>
                    <div className="flex items-center justify-between gap-2 pl-7">
                      <span className="font-bold text-base text-primary">R$ {Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <PaymentIcon method={order.payment_method} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-7">
                      <Badge variant={status.variant} className={`text-[10px] ${status.badgeClass || ''}`}>{status.label}</Badge>
                      <Badge variant="outline" className={`text-[10px] ${delivery?.badgeClass || ''}`}>{delivery?.label || 'Processando'}</Badge>
                      {order.tracking_code && <Badge variant="secondary" className="text-[10px] font-mono">{order.tracking_code}</Badge>}
                      {order.coupon_code && (
                        <Badge variant="outline" className="text-[10px] gap-0.5">
                          <Ticket className="w-2.5 h-2.5" /> {order.coupon_code}
                        </Badge>
                      )}
                      {order.shipping_status === 'insufficient_balance' && (
                        <Badge variant="destructive" className="text-[10px] animate-pulse">💰 Sem saldo ME</Badge>
                      )}
                      {order.shipping_status === 'checkout_error' && (
                        <Badge variant="destructive" className="text-[10px]">⚠️ Erro etiqueta</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop table view */}
          <Card className="border-border/50 overflow-hidden hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.has(o.id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Rastreio</TableHead>
                    <TableHead>Cupom</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => {
                    const status = statusMap[order.status] || { label: order.status, variant: 'outline' as const, badgeClass: '' };
                    const delivery = deliveryStatuses.find(d => d.value === order.delivery_status);
                    return (
                      <TableRow key={order.id} className={selectedIds.has(order.id) ? 'bg-primary/5' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelect(order.id)}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-sm font-medium max-w-[150px] truncate">
                          {order.customer_name || '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {order.product_name} {order.dosage ? `- ${order.dosage}` : ''}
                        </TableCell>
                        <TableCell className="text-center">
                          <PaymentIcon method={order.payment_method} />
                        </TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">
                          R$ {Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className={`text-[10px] ${status.badgeClass || ''}`}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className={`text-[10px] w-fit ${delivery?.badgeClass || ''}`}>
                              {delivery?.label || 'Processando'}
                            </Badge>
                            {order.shipping_status === 'insufficient_balance' && (
                              <Badge variant="destructive" className="text-[10px] w-fit animate-pulse">
                                💰 Sem saldo ME
                              </Badge>
                            )}
                            {order.shipping_status === 'checkout_error' && (
                              <Badge variant="destructive" className="text-[10px] w-fit">
                                ⚠️ Erro etiqueta
                              </Badge>
                            )}
                          </div>
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
                          {order.coupon_code ? (
                            <Badge variant="outline" className="text-[10px] gap-0.5">
                              <Ticket className="w-2.5 h-2.5" /> {order.coupon_code}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewOrder(order)}>
                                <Eye className="mr-2 h-4 w-4" /> Visualizar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(order)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => refreshTracking(order.id)}
                                disabled={refreshingTracking === order.id}
                              >
                                {refreshingTracking === order.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Truck className="mr-2 h-4 w-4" />
                                )}
                                Buscar Rastreio
                              </DropdownMenuItem>
                              {order.status === 'PAID' && !order.tracking_code && (order.shipping_status === 'insufficient_balance' || order.shipping_status === 'checkout_error' || !order.shipment_id) && (
                                <DropdownMenuItem
                                  onClick={() => retryShipping(order.id)}
                                  disabled={retryingShipping === order.id}
                                  className="text-primary"
                                >
                                  {retryingShipping === order.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                  )}
                                  Retentar Etiqueta
                                </DropdownMenuItem>
                              )}
                              {order.customer_phone && (
                                <DropdownMenuItem onClick={() => openWhatsappDialog(order)}>
                                  <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp
                                </DropdownMenuItem>
                              )}
                              {order.status === 'PAID' && !order.tracking_code && (
                                <DropdownMenuItem onClick={() => {
                                  const addr = `${order.customer_name}\n${order.customer_address}, ${order.customer_number}${order.customer_complement ? ` - ${order.customer_complement}` : ''}\n${order.customer_district}\n${order.customer_city} - ${order.customer_state}\nCEP: ${order.customer_postal_code}`;
                                  navigator.clipboard.writeText(addr).then(() => {
                                    toast({ title: 'Endereço copiado!', description: 'Cole os dados no Melhor Envio.' });
                                  });
                                  window.open(`https://melhorenvio.com.br/app/carrinho`, '_blank');
                                }}>
                                  <Truck className="mr-2 h-4 w-4" /> Gerar Etiqueta Manual
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => {
                                const url = `${window.location.origin}/minha-conta?tab=reviews&order=${order.id}`;
                                navigator.clipboard.writeText(url);
                                toast({ title: 'Link de avaliação copiado!' });
                              }}>
                                <Star className="mr-2 h-4 w-4" /> Link de Avaliação
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-muted-foreground">
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
                <InfoRow label="Gateway" value={viewOrder.payment_gateway === 'mercadopago' ? 'Mercado Pago' : 'Asaas'} />
                <InfoRow label="Ambiente" value={viewOrder.gateway_environment === 'production' ? '🟢 Produção' : '🟡 Sandbox (Teste)'} />
                {viewOrder.asaas_payment_id && <InfoRow label="ID Asaas" value={viewOrder.asaas_payment_id} />}
                {viewOrder.coupon_code && (
                  <>
                    <InfoRow label="Cupom" value={viewOrder.coupon_code} />
                    <InfoRow label="Desconto cupom" value={`R$ ${Number(viewOrder.coupon_discount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                  </>
                )}
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
              {viewOrder.status === 'PAID' && !viewOrder.tracking_code && viewOrder.customer_postal_code && (
                <>
                  <Separator />
                  <Button
                    className="w-full"
                    onClick={() => {
                      window.open('https://melhorenvio.com.br/app/carrinho', '_blank');
                      const addr = `${viewOrder.customer_name}\n${viewOrder.customer_address}, ${viewOrder.customer_number}${viewOrder.customer_complement ? ` - ${viewOrder.customer_complement}` : ''}\n${viewOrder.customer_district}\n${viewOrder.customer_city} - ${viewOrder.customer_state}\nCEP: ${viewOrder.customer_postal_code}`;
                      navigator.clipboard.writeText(addr).then(() => {
                        toast({ title: 'Endereço copiado!', description: 'Cole os dados no Melhor Envio.' });
                      });
                    }}
                  >
                    <Truck className="mr-2 h-4 w-4" /> Gerar Etiqueta Manual
                  </Button>
                </>
              )}
              <Separator />
              <InfoRow label="Criado em" value={new Date(viewOrder.created_at).toLocaleString('pt-BR')} />
              <InfoRow label="Atualizado em" value={new Date(viewOrder.updated_at).toLocaleString('pt-BR')} />

              {/* Shipping Logs Section */}
              <Separator />
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => {
                    if (!showLogs) {
                      setShowLogs(true);
                      fetchShippingLogs(viewOrder.id);
                    } else {
                      setShowLogs(false);
                    }
                  }}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Histórico Técnico do Frete
                  </span>
                  {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>

                {showLogs && (
                  <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
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

      {/* Batch delete confirmation */}
      <AlertDialog open={showBatchDelete} onOpenChange={(open) => { setShowBatchDelete(open); if (!open) setBatchDeleteConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Excluir {selectedIds.size} pedido(s)?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">Todos os pedidos selecionados serão removidos <strong>permanentemente</strong>. Esta ação <strong>não pode ser desfeita</strong>.</span>
              <span className="block font-medium">Para confirmar, digite <strong className="text-destructive">EXCLUIR</strong> abaixo:</span>
              <Input
                value={batchDeleteConfirmText}
                onChange={(e) => setBatchDeleteConfirmText(e.target.value)}
                placeholder="Digite EXCLUIR para confirmar"
                className="mt-2"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBatchDeleteConfirmText('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={batchDelete} 
              disabled={batchDeleting || batchDeleteConfirmText !== 'EXCLUIR'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {batchDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir {selectedIds.size} pedido(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* WhatsApp message dialog */}
      <Dialog open={!!whatsappOrder} onOpenChange={(open) => !open && setWhatsappOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> Enviar WhatsApp
            </DialogTitle>
          </DialogHeader>
          {whatsappOrder && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Destinatário</Label>
                <p className="text-xs text-muted-foreground mb-1">{whatsappOrder.customer_name}</p>
                <Input
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="5511999999999"
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Número com código do país (ex: 55 para Brasil). Ajuste se necessário.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Templates</Label>
                <div className="flex flex-wrap gap-1.5">
                  {whatsappTemplates.map(tpl => (
                    <Button
                      key={tpl.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => applyTemplate(tpl.id)}
                    >
                      {tpl.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  rows={5}
                  placeholder="Selecione um template ou digite a mensagem..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWhatsappOrder(null)}>Cancelar</Button>
                <Button onClick={handleSendWhatsapp} disabled={sendingWhatsapp || !whatsappMessage.trim() || !whatsappNumber.trim()}>
                  {sendingWhatsapp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Enviar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;