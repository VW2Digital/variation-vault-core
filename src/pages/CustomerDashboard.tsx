import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Package, LogOut, Truck, Clock, CheckCircle2, XCircle,
  Copy, ExternalLink, ShoppingCart, User, Search, Filter,
  TrendingUp, CreditCard, MapPin, ChevronDown, RotateCw, Save, Phone, HelpCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/contexts/CartContext';
import Header from '@/components/Header';
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

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/cliente/login'); return; }
      setUser(session.user);
      await Promise.all([
        fetchOrders(session.user.email || ''),
        fetchProfile(session.user.id),
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

                                {/* Shipping Info */}
                                {(order.tracking_code || order.shipping_service) && (
                                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-3">
                                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">Informações de Envio</p>
                                    {order.shipping_service && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <Truck className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Transportadora:</span>
                                        <span className="font-medium text-foreground">{order.shipping_service}</span>
                                      </div>
                                    )}
                                    {order.tracking_code && (
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Package className="w-4 h-4 text-primary" />
                                          <div>
                                            <p className="text-xs text-muted-foreground">Código de Rastreio</p>
                                            <p className="font-mono font-semibold text-foreground">{order.tracking_code}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                          <Button variant="ghost" size="sm" onClick={() => copyTracking(order.tracking_code)}>
                                            <Copy className="w-4 h-4" />
                                          </Button>
                                          {order.tracking_url && (
                                            <Button variant="ghost" size="sm" asChild>
                                              <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="w-4 h-4" />
                                              </a>
                                            </Button>
                                          )}
                                        </div>
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

              {/* Help Tab */}
              <TabsContent value="help">
                {user && <SupportChat userId={user.id} />}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
};

export default CustomerDashboard;
