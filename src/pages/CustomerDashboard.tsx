import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Package, LogOut, Truck, Clock, CheckCircle2, XCircle,
  Copy, ExternalLink, ShoppingCart, User, Search, Filter,
  TrendingUp, CreditCard, MapPin, ChevronDown, RotateCw, Save, Phone, HelpCircle,
  Star, MessageSquare,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/contexts/CartContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AddressManager from '@/components/AddressManager';
import SupportChat from '@/components/SupportChat';

const paymentStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; color: string; badgeClass?: string }> = {
  PENDING: { label: 'Aguardando Pagamento', variant: 'outline', icon: Clock, color: 'text-amber-500' },
  PAID: { label: 'Pago', variant: 'default', icon: CheckCircle2, color: 'text-emerald-500', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  RECEIVED: { label: 'Pago', variant: 'default', icon: CheckCircle2, color: 'text-emerald-500', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  CONFIRMED: { label: 'Pago', variant: 'default', icon: CheckCircle2, color: 'text-emerald-500', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  OVERDUE: { label: 'Vencido', variant: 'destructive', icon: XCircle, color: 'text-red-500' },
  REFUNDED: { label: 'Estornado', variant: 'secondary', icon: XCircle, color: 'text-muted-foreground' },
};

const deliveryStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  PROCESSING: { label: 'Em Processamento', variant: 'outline', color: 'text-amber-500' },
  SHIPPED: { label: 'Enviado', variant: 'default', color: 'text-blue-500' },
  IN_TRANSIT: { label: 'Em Trânsito', variant: 'secondary', color: 'text-blue-500' },
  DELIVERED: { label: 'Entregue', variant: 'default', color: 'text-emerald-500' },
  RETURNED: { label: 'Devolvido', variant: 'destructive', color: 'text-red-500' },
};

type StatusFilter = 'all' | 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE';
type DeliveryFilter = 'all' | 'PROCESSING' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED';

const CustomerDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/cliente/login'); return; }
      setUser(session.user);
      await Promise.all([
        fetchOrders(session.user.email || ''),
        fetchProfile(session.user.id),
        fetchReviews(session.user.id),
      ]);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) navigate('/cliente/login');
    });
    checkAuth();
    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchOrders = async (email: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_email', email)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar pedidos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) {
        setProfileName(data.full_name || '');
        setProfilePhone(data.phone || '');
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          full_name: profileName.trim(),
          phone: profilePhone.trim(),
        }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Perfil atualizado com sucesso!' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar perfil', description: err.message, variant: 'destructive' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/cliente/login');
  };

  const copyTracking = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Código copiado!' });
  };

  const refreshOrders = () => {
    if (user?.email) fetchOrders(user.email);
  };

  const fetchReviews = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      console.error('Reviews fetch error:', err);
    }
  };

  const submitReview = async (orderId: string, productName: string) => {
    if (!user) return;
    setReviewSaving(true);
    try {
      const { error } = await supabase.from('reviews').upsert({
        user_id: user.id,
        order_id: orderId,
        product_name: productName,
        rating: reviewRating,
        comment: reviewComment.trim(),
      }, { onConflict: 'user_id,order_id' });
      if (error) throw error;
      toast({ title: 'Avaliação enviada com sucesso!' });
      setReviewingOrderId(null);
      setReviewRating(5);
      setReviewComment('');
      fetchReviews(user.id);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar avaliação', description: err.message, variant: 'destructive' });
    } finally {
      setReviewSaving(false);
    }
  };

  const reviewedOrderIds = useMemo(() => new Set(reviews.map(r => r.order_id)), [reviews]);

  // Stats
  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter(o => o.status === 'RECEIVED' || o.status === 'CONFIRMED').length;
    const pending = orders.filter(o => o.status === 'PENDING').length;
    const shipped = orders.filter(o => ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(o.delivery_status)).length;
    const totalSpent = orders
      .filter(o => o.status === 'RECEIVED' || o.status === 'CONFIRMED')
      .reduce((sum, o) => sum + Number(o.total_value), 0);
    return { total, paid, pending, shipped, totalSpent };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (deliveryFilter !== 'all' && o.delivery_status !== deliveryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          o.product_name?.toLowerCase().includes(term) ||
          o.id?.toLowerCase().includes(term) ||
          o.tracking_code?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [orders, statusFilter, deliveryFilter, searchTerm]);

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Olá, {userName}! 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Acompanhe seus pedidos e entregas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshOrders}>
              <RotateCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            <Link to="/catalogo">
              <Button size="sm">
                <ShoppingCart className="w-4 h-4 mr-1" /> Comprar
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                      <p className="text-xs text-muted-foreground">Total de Pedidos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stats.shipped}</p>
                      <p className="text-xs text-muted-foreground">Enviados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        R$ {stats.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Gasto</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="orders" className="space-y-4">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="orders" className="flex items-center gap-1.5">
                  <Package className="w-4 h-4" /> Pedidos
                </TabsTrigger>
                <TabsTrigger value="addresses" className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Endereços
                </TabsTrigger>
                <TabsTrigger value="profile" className="flex items-center gap-1.5">
                  <User className="w-4 h-4" /> Perfil
                </TabsTrigger>
                <TabsTrigger value="reviews" className="flex items-center gap-1.5">
                  <Star className="w-4 h-4" /> Avaliações
                </TabsTrigger>
                <TabsTrigger value="help" className="flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" /> Ajuda
                </TabsTrigger>
              </TabsList>

              {/* Orders Tab */}
              <TabsContent value="orders" className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por produto, pedido ou rastreio..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="all">Pagamento: Todos</option>
                      <option value="PENDING">Pendente</option>
                      <option value="RECEIVED">Pago</option>
                      <option value="CONFIRMED">Confirmado</option>
                      <option value="OVERDUE">Vencido</option>
                    </select>
                    <select
                      value={deliveryFilter}
                      onChange={(e) => setDeliveryFilter(e.target.value as DeliveryFilter)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="all">Entrega: Todos</option>
                      <option value="PROCESSING">Processando</option>
                      <option value="SHIPPED">Enviado</option>
                      <option value="IN_TRANSIT">Em Trânsito</option>
                      <option value="DELIVERED">Entregue</option>
                    </select>
                  </div>
                </div>

                {/* Order Count */}
                <p className="text-sm text-muted-foreground">
                  {filteredOrders.length} {filteredOrders.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}
                </p>

                {/* Orders List */}
                {filteredOrders.length === 0 ? (
                  <Card className="border-border/50">
                    <CardContent className="py-12 text-center space-y-3">
                      <Package className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                      <h3 className="text-base font-semibold text-foreground">Nenhum pedido encontrado</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        {orders.length === 0
                          ? 'Seus pedidos aparecerão aqui após a primeira compra.'
                          : 'Tente ajustar os filtros de busca.'
                        }
                      </p>
                      {orders.length === 0 && (
                        <Link to="/catalogo">
                          <Button className="mt-2">Ver Catálogo</Button>
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredOrders.map((order) => {
                      const paymentStatus = paymentStatusMap[order.status] || { label: order.status, variant: 'outline' as const, icon: Clock, color: '', badgeClass: '' };
                      const deliveryStatus = deliveryStatusMap[order.delivery_status] || { label: order.delivery_status || 'Em Processamento', variant: 'outline' as const, color: '' };
                      const PaymentIcon = paymentStatus.icon;
                      const isExpanded = expandedOrder === order.id;

                      return (
                        <Card
                          key={order.id}
                          className="border-border/50 overflow-hidden transition-shadow hover:shadow-md cursor-pointer"
                          onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        >
                          <CardContent className="p-4 space-y-3">
                            {/* Top Row */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                  #{order.id.slice(0, 8).toUpperCase()}
                                </span>
                                <h3 className="font-semibold text-foreground text-sm truncate">{order.product_name}</h3>
                                {order.dosage && (
                                  <span className="text-xs text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded shrink-0">
                                    {order.dosage}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </div>

                            {/* Status + Price Row */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant={paymentStatus.variant} className={`flex items-center gap-1 text-xs ${paymentStatus.badgeClass || ''}`}>
                                  <PaymentIcon className="w-3 h-3" />
                                  {paymentStatus.label}
                                </Badge>
                                <Badge variant={deliveryStatus.variant} className="flex items-center gap-1 text-xs">
                                  <Truck className="w-3 h-3" />
                                  {deliveryStatus.label}
                                </Badge>
                              </div>
                              <p className="font-bold text-primary">
                                R$ {Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <div className="pt-3 border-t border-border/50 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* Delivery Timeline */}
                                <div className="bg-muted/30 border border-border/30 rounded-lg p-4">
                                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Timeline do Pedido</p>
                                  <div className="flex items-center justify-between relative">
                                    {/* Progress line */}
                                    <div className="absolute top-4 left-0 right-0 h-0.5 bg-border" />
                                    <div
                                      className="absolute top-4 left-0 h-0.5 bg-primary transition-all duration-500"
                                      style={{
                                        width: order.delivery_status === 'DELIVERED' ? '100%'
                                          : order.delivery_status === 'IN_TRANSIT' ? '66%'
                                          : order.delivery_status === 'SHIPPED' ? '33%'
                                          : '0%'
                                      }}
                                    />
                                    {[
                                      { key: 'PROCESSING', label: 'Processando', icon: Clock },
                                      { key: 'SHIPPED', label: 'Enviado', icon: Package },
                                      { key: 'IN_TRANSIT', label: 'Em Trânsito', icon: Truck },
                                      { key: 'DELIVERED', label: 'Entregue', icon: CheckCircle2 },
                                    ].map((step, i) => {
                                      const statusOrder = ['PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'];
                                      const currentIdx = statusOrder.indexOf(order.delivery_status || 'PROCESSING');
                                      const stepIdx = statusOrder.indexOf(step.key);
                                      const isActive = stepIdx <= currentIdx;
                                      const isCurrent = stepIdx === currentIdx;
                                      const StepIcon = step.icon;
                                      return (
                                        <div key={step.key} className="flex flex-col items-center relative z-10">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                            isCurrent ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                                            isActive ? 'bg-primary text-primary-foreground' :
                                            'bg-muted text-muted-foreground'
                                          }`}>
                                            <StepIcon className="w-4 h-4" />
                                          </div>
                                          <span className={`text-[10px] mt-1.5 font-medium text-center ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                                            {step.label}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Order Details Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                  <div>
                                    <p className="text-muted-foreground text-xs">Quantidade</p>
                                    <p className="font-medium text-foreground">{order.quantity} un.</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs">Preço Unitário</p>
                                    <p className="font-medium text-foreground">
                                      R$ {Number(order.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs">Pagamento</p>
                                    <p className="font-medium text-foreground capitalize flex items-center gap-1">
                                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                                      {order.payment_method === 'credit_card' ? 'Cartão' : order.payment_method?.toUpperCase()}
                                      {order.installments > 1 && ` (${order.installments}x)`}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs">Pedido</p>
                                    <p className="font-mono text-xs text-foreground">{order.id.slice(0, 8).toUpperCase()}</p>
                                  </div>
                                </div>

                                {/* Address */}
                                {order.customer_address && (
                                  <div className="bg-muted/30 border border-border/30 rounded-lg p-3">
                                    <div className="flex items-start gap-2">
                                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                      <div className="text-sm">
                                        <p className="text-xs text-muted-foreground font-medium mb-1">Endereço de Entrega</p>
                                        <p className="text-foreground">
                                          {order.customer_address}, {order.customer_number}
                                          {order.customer_complement ? ` - ${order.customer_complement}` : ''}
                                        </p>
                                        <p className="text-muted-foreground">
                                          {order.customer_district} - {order.customer_city}/{order.customer_state}
                                        </p>
                                        <p className="text-muted-foreground">CEP: {order.customer_postal_code}</p>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Tracking & Shipping Info */}
                                {(order.tracking_code || order.shipping_service) && (
                                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
                                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Rastreamento</p>
                                    {order.shipping_service && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <Truck className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Transportadora:</span>
                                        <span className="font-medium text-foreground">{order.shipping_service}</span>
                                      </div>
                                    )}
                                    {order.tracking_code && (
                                      <div className="bg-background/80 border border-border/50 rounded-lg p-3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <Package className="w-5 h-5 text-primary" />
                                            <div>
                                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Código de Rastreio</p>
                                              <p className="font-mono font-bold text-foreground text-lg tracking-widest">{order.tracking_code}</p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Button variant="outline" size="sm" onClick={() => copyTracking(order.tracking_code)} className="gap-1">
                                              <Copy className="w-3.5 h-3.5" /> Copiar
                                            </Button>
                                          </div>
                                        </div>
                                        {order.tracking_url && (
                                          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                                            <Button asChild className="w-full gap-2" size="sm">
                                              <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="w-4 h-4" /> Rastrear Encomenda
                                              </a>
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {order.shipping_cost > 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        Frete: R$ {Number(order.shipping_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Addresses Tab */}
              <TabsContent value="addresses">
                <AddressManager />
              </TabsContent>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="w-5 h-5" /> Meus Dados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {profileLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="profile-name">Nome completo</Label>
                            <Input
                              id="profile-name"
                              value={profileName}
                              onChange={(e) => setProfileName(e.target.value)}
                              placeholder="Seu nome completo"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="profile-phone">Telefone</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                id="profile-phone"
                                value={profilePhone}
                                onChange={(e) => setProfilePhone(e.target.value)}
                                placeholder="(00) 00000-0000"
                                className="pl-9"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">Email</p>
                            <p className="text-foreground font-medium text-sm">{user?.email}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium">Membro desde</p>
                            <p className="text-foreground font-medium text-sm">
                              {user?.created_at
                                ? new Date(user.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                                : '-'
                              }
                            </p>
                          </div>
                        </div>
                        <Button onClick={saveProfile} disabled={profileSaving} className="w-full sm:w-auto">
                          {profileSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                          Salvar Alterações
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Last delivery address */}
                {orders.length > 0 && orders[0].customer_address && (
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="w-5 h-5" /> Último Endereço Usado
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm space-y-1">
                        <p className="text-foreground font-medium">
                          {orders[0].customer_address}, {orders[0].customer_number}
                          {orders[0].customer_complement ? ` - ${orders[0].customer_complement}` : ''}
                        </p>
                        <p className="text-muted-foreground">
                          {orders[0].customer_district} - {orders[0].customer_city}/{orders[0].customer_state}
                        </p>
                        <p className="text-muted-foreground">CEP: {orders[0].customer_postal_code}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Reviews Tab */}
              <TabsContent value="reviews" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Star className="w-5 h-5" /> Minhas Avaliações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Orders available for review */}
                    {orders.filter(o => (o.status === 'RECEIVED' || o.status === 'CONFIRMED')).length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <Star className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                        <p className="text-sm text-muted-foreground">Você ainda não possui pedidos pagos para avaliar.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {orders
                          .filter(o => o.status === 'RECEIVED' || o.status === 'CONFIRMED')
                          .map((order) => {
                            const existingReview = reviews.find(r => r.order_id === order.id);
                            const isReviewing = reviewingOrderId === order.id;

                            return (
                              <div key={order.id} className="border border-border/50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold text-sm text-foreground">{order.product_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {order.dosage && `${order.dosage} · `}
                                      Pedido #{order.id.slice(0, 8).toUpperCase()} · {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                    </p>
                                  </div>
                                  {existingReview ? (
                                    <div className="flex items-center gap-1">
                                      {[1, 2, 3, 4, 5].map(s => (
                                        <Star key={s} className={`w-4 h-4 ${s <= existingReview.rating ? 'text-primary fill-primary' : 'text-muted-foreground/30'}`} />
                                      ))}
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setReviewingOrderId(isReviewing ? null : order.id);
                                        setReviewRating(5);
                                        setReviewComment('');
                                      }}
                                    >
                                      <Star className="w-4 h-4 mr-1" /> Avaliar
                                    </Button>
                                  )}
                                </div>

                                {existingReview && existingReview.comment && (
                                  <p className="text-sm text-muted-foreground italic">"{existingReview.comment}"</p>
                                )}

                                {isReviewing && !existingReview && (
                                  <div className="space-y-3 pt-2 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="space-y-1">
                                      <Label className="text-xs">Nota</Label>
                                      <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map(s => (
                                          <button
                                            key={s}
                                            type="button"
                                            onClick={() => setReviewRating(s)}
                                            className="focus:outline-none"
                                          >
                                            <Star className={`w-6 h-6 transition-colors ${s <= reviewRating ? 'text-primary fill-primary' : 'text-muted-foreground/30 hover:text-primary/50'}`} />
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">Comentário (opcional)</Label>
                                      <Textarea
                                        value={reviewComment}
                                        onChange={(e) => setReviewComment(e.target.value)}
                                        placeholder="Conte sua experiência com o produto..."
                                        rows={3}
                                        maxLength={500}
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => submitReview(order.id, order.product_name)}
                                        disabled={reviewSaving}
                                      >
                                        {reviewSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                                        Enviar Avaliação
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => setReviewingOrderId(null)}>
                                        Cancelar
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Help Tab */}
              <TabsContent value="help">
                {user && <SupportChat userId={user.id} />}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CustomerDashboard;
