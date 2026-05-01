import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Package, LogOut, Truck, Clock, CheckCircle2, XCircle,
  Copy, ExternalLink, ShoppingCart, User, Search, Filter,
  TrendingUp, CreditCard, MapPin, ChevronDown, RotateCw, Save, Phone, HelpCircle,
  Star, MessageSquare, Mail, BellRing, LayoutDashboard, Download,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/contexts/CartContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AddressManager from '@/components/AddressManager';
import SupportChat from '@/components/SupportChat';
import CustomerDownloads from '@/components/CustomerDownloads';
import { useIsMobile } from '@/hooks/use-mobile';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const paymentStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; color: string; badgeClass?: string }> = {
  PENDING: { label: 'Aguardando Pagamento', variant: 'outline', icon: Clock, color: 'text-amber-500' },
  PAID: { label: 'Pago', variant: 'default', icon: CheckCircle2, color: 'text-emerald-500', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  RECEIVED: { label: 'Pago', variant: 'default', icon: CheckCircle2, color: 'text-emerald-500', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  CONFIRMED: { label: 'Pago', variant: 'default', icon: CheckCircle2, color: 'text-emerald-500', badgeClass: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  OVERDUE: { label: 'Vencido', variant: 'destructive', icon: XCircle, color: 'text-red-500' },
  REFUNDED: { label: 'Estornado', variant: 'secondary', icon: XCircle, color: 'text-muted-foreground' },
  IN_REVIEW: { label: 'Em Análise', variant: 'outline', icon: Clock, color: 'text-amber-500' },
  DECLINED: { label: 'Recusado', variant: 'destructive', icon: XCircle, color: 'text-red-500' },
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
  const [searchParams] = useSearchParams();
  const { totalItems } = useCart();
  const defaultTab = searchParams.get('tab') || 'orders';
  const defaultReviewOrder = searchParams.get('order') || null;
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
  const [allowEmailMkt, setAllowEmailMkt] = useState(true);
  const [allowWhatsAppMkt, setAllowWhatsAppMkt] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(defaultReviewOrder);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [payNowLoading, setPayNowLoading] = useState<string | null>(null);
  const [pixModal, setPixModal] = useState<{ orderId: string; qrCode: string; payload: string; value: number } | null>(null);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const handlePayNow = async (order: any) => {
    setPayNowLoading(order.id);
    try {
      if (order.payment_method === 'pix') {
        // Fetch PIX QR Code
        const { data, error } = await supabase.functions.invoke('asaas-checkout', {
          body: { action: 'get_pix_qrcode', paymentId: order.asaas_payment_id },
        });
        if (error || !data) throw new Error('Erro ao buscar QR Code');
        setPixModal({
          orderId: order.id,
          qrCode: data.encodedImage,
          payload: data.payload,
          value: Number(order.total_value),
        });
      } else {
        // Credit/debit card: fetch payment details and redirect to invoice URL
        const { data, error } = await supabase.functions.invoke('asaas-checkout', {
          body: { action: 'get_payment_status', paymentId: order.asaas_payment_id },
        });
        if (error || !data) throw new Error('Erro ao buscar dados do pagamento');
        if (data.invoiceUrl) {
          window.open(data.invoiceUrl, '_blank');
        } else {
          toast({ title: 'Link de pagamento indisponível', description: 'Não foi possível obter o link para finalizar o pagamento.', variant: 'destructive' });
        }
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Não foi possível processar', variant: 'destructive' });
    } finally {
      setPayNowLoading(null);
    }
  };

  const copyPixCode = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Código PIX copiado!' });
  };
  useEffect(() => {
    let userEmail = '';
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/cliente/login'); return; }
      setUser(session.user);
      userEmail = session.user.email || '';
      await Promise.all([
        fetchOrders(userEmail, session.user.id),
        fetchProfile(session.user.id),
        fetchReviews(session.user.id),
      ]);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) navigate('/cliente/login');
    });
    checkAuth();

    const channel = supabase
      .channel('customer-orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        if (userEmail) fetchOrders(userEmail, user?.id);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  const fetchOrders = async (email: string, userId?: string) => {
    setLoading(true);
    try {
      // Busca por user_id OU email case-insensitive (cobre pedidos antigos sem vínculo
      // e variações de capitalização no email)
      const filters = userId
        ? `customer_user_id.eq.${userId},customer_email.ilike.${email}`
        : `customer_email.ilike.${email}`;
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .or(filters)
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
      const { data: prefs } = await supabase
        .from('contact_preferences')
        .select('allow_email_marketing, allow_whatsapp_marketing')
        .eq('user_id', userId)
        .maybeSingle();
      if (prefs) {
        setAllowEmailMkt(prefs.allow_email_marketing !== false);
        setAllowWhatsAppMkt(prefs.allow_whatsapp_marketing !== false);
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

  const saveContactPreferences = async (next: { email?: boolean; whatsapp?: boolean }) => {
    if (!user) return;
    const prevEmail = allowEmailMkt;
    const prevWa = allowWhatsAppMkt;
    const newEmail = next.email ?? prevEmail;
    const newWa = next.whatsapp ?? prevWa;
    setAllowEmailMkt(newEmail);
    setAllowWhatsAppMkt(newWa);
    setPrefsSaving(true);
    try {
      const { error } = await supabase
        .from('contact_preferences')
        .upsert({
          user_id: user.id,
          allow_email_marketing: newEmail,
          allow_whatsapp_marketing: newWa,
        }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Preferências atualizadas' });
    } catch (err: any) {
      // Revert on failure
      setAllowEmailMkt(prevEmail);
      setAllowWhatsAppMkt(prevWa);
      toast({ title: 'Erro ao salvar preferências', description: err.message, variant: 'destructive' });
    } finally {
      setPrefsSaving(false);
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

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24 md:pb-6">
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
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
            {/* Sidebar */}
            <aside className="space-y-3">
              <Card className="border-border/50">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-sm text-foreground truncate max-w-full">{userName}</p>
                  <Button variant="default" size="sm" onClick={handleLogout} className="w-full gap-1">
                    <LogOut className="w-3.5 h-3.5" /> Sair
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-border/50 overflow-hidden">
                <nav className="flex flex-col">
                  {[
                    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                    { key: 'orders', label: 'Pedidos', icon: Package },
                    { key: 'downloads', label: 'Downloads', icon: Download },
                    { key: 'addresses', label: 'Endereços', icon: MapPin },
                    { key: 'profile', label: 'Detalhes da Conta', icon: User },
                    { key: 'reviews', label: 'Avaliações', icon: Star },
                    { key: 'help', label: 'Ajuda', icon: HelpCircle },
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveTab(item.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm text-left border-l-2 transition-colors ${
                          active
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-transparent text-foreground hover:bg-muted/50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-left border-l-2 border-transparent text-foreground hover:bg-muted/50"
                  >
                    <LogOut className="w-4 h-4" /> Sair
                  </button>
                </nav>
              </Card>
            </aside>

            {/* Content */}
            <section className="space-y-4 min-w-0">
              {activeTab === 'dashboard' && (
                <Card className="border-border/50">
                  <CardContent className="p-6 space-y-3">
                    <h2 className="text-lg font-semibold text-foreground">
                      Olá, {userName}!
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      A partir do painel da sua conta você pode visualizar seus{' '}
                      <button onClick={() => setActiveTab('orders')} className="text-primary hover:underline font-medium">pedidos recentes</button>,
                      gerenciar seus{' '}
                      <button onClick={() => setActiveTab('addresses')} className="text-primary hover:underline font-medium">endereços de entrega e cobrança</button>,
                      e{' '}
                      <button onClick={() => setActiveTab('profile')} className="text-primary hover:underline font-medium">editar sua senha e detalhes da conta</button>.
                    </p>
                  </CardContent>
                </Card>
              )}

            {activeTab === 'dashboard' && (
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
            )}

              {/* Orders Tab */}
              {activeTab === 'orders' && (
              <div className="space-y-4">
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
                              <div className="flex items-center gap-2">
                                {order.status === 'PENDING' && order.asaas_payment_id && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-7 text-xs gap-1"
                                    onClick={(e) => { e.stopPropagation(); handlePayNow(order); }}
                                    disabled={payNowLoading === order.id}
                                  >
                                    {payNowLoading === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                                    Pagar Agora
                                  </Button>
                                )}
                                {['PAID', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(order.status) && !reviewedOrderIds.has(order.id) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTab('reviews');
                                      setReviewingOrderId(order.id);
                                      setReviewRating(5);
                                      setReviewComment('');
                                      setTimeout(() => {
                                        document.querySelector(`[data-review-order="${order.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      }, 150);
                                    }}
                                  >
                                    <Star className="w-3 h-3" />
                                    Avaliar Compra
                                  </Button>
                                )}
                                {['PAID', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(order.status) && reviewedOrderIds.has(order.id) && (
                                  <Badge variant="outline" className="h-7 text-xs gap-1 border-primary/40 text-primary">
                                    <Star className="w-3 h-3 fill-primary" />
                                    Avaliado
                                  </Badge>
                                )}
                                <p className="font-bold text-primary">
                                  R$ {Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
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
                                      {order.installments > 1 && ` (${order.installments}x de R$ ${(Number(order.total_value) / order.installments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`}
                                    </p>
                                    {order.installments > 1 && order.payment_method === 'credit_card' && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Total c/ juros: R$ {Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </p>
                                    )}
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
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
              )}

              {/* Addresses Tab */}
              {activeTab === 'addresses' && (
                <AddressManager />
              )}

              {/* Profile Tab */}
              {activeTab === 'profile' && (
              <div className="space-y-4">
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

                {/* Contact Preferences */}
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BellRing className="w-5 h-5" /> Preferências de Contato
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Escolha como você prefere receber lembretes da loja, como o aviso de itens deixados no carrinho.
                      Mensagens essenciais sobre seus pedidos (pagamento, envio, entrega) serão enviadas mesmo se você desativar.
                    </p>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Mail className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">Email de marketing</p>
                          <p className="text-xs text-muted-foreground break-all">{user?.email}</p>
                        </div>
                      </div>
                      <Switch
                        checked={allowEmailMkt}
                        disabled={prefsSaving}
                        onCheckedChange={(v) => saveContactPreferences({ email: v })}
                        aria-label="Receber emails de marketing"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <MessageSquare className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm">WhatsApp de marketing</p>
                          <p className="text-xs text-muted-foreground">
                            {profilePhone || 'Cadastre um telefone para receber'}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={allowWhatsAppMkt}
                        disabled={prefsSaving}
                        onCheckedChange={(v) => saveContactPreferences({ whatsapp: v })}
                        aria-label="Receber WhatsApp de marketing"
                      />
                    </div>
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
              </div>
              )}

              {/* Reviews Tab */}
              {activeTab === 'reviews' && (
              <div className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Star className="w-5 h-5" /> Minhas Avaliações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Orders available for review */}
                    {orders.filter(o => ['PAID', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(o.status)).length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <Star className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                        <p className="text-sm text-muted-foreground">Você ainda não possui pedidos pagos para avaliar.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {orders
                          .filter(o => ['PAID', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(o.status))
                          .map((order) => {
                            const existingReview = reviews.find(r => r.order_id === order.id);
                            const isReviewing = reviewingOrderId === order.id;

                            return (
                              <div key={order.id} data-review-order={order.id} className={`border rounded-lg p-4 space-y-3 transition-colors ${isReviewing ? 'border-primary/60 bg-primary/5' : 'border-border/50'}`}>
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
              </div>
              )}

              {/* Help Tab */}
              {activeTab === 'help' && user && (
                <SupportChat userId={user.id} />
              )}

              {/* Downloads Tab */}
              {activeTab === 'downloads' && user && (
                <CustomerDownloads userId={user.id} />
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />

      {/* PIX Payment Modal */}
      <Dialog open={!!pixModal} onOpenChange={(open) => !open && setPixModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Pagar via PIX</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Escaneie o QR Code ou copie o código abaixo</p>
            {pixModal?.qrCode && (
              <img src={`data:image/png;base64,${pixModal.qrCode}`} alt="QR Code PIX" className="w-48 h-48 mx-auto rounded-lg border border-border" />
            )}
            {pixModal?.payload && (
              <div className="flex items-center gap-2">
                <Input value={pixModal.payload} readOnly className="text-xs" />
                <Button size="icon" variant="outline" onClick={() => copyPixCode(pixModal.payload)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-sm font-semibold text-foreground">
              Valor: R$ {pixModal?.value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Após o pagamento, o status será atualizado automaticamente.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerDashboard;
