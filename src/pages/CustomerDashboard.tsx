import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Package, LogOut, Truck, Clock, CheckCircle2, XCircle, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logoImg from '@/assets/liberty-pharma-logo.png';

const paymentStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  PENDING: { label: 'Aguardando Pagamento', variant: 'outline', icon: Clock },
  RECEIVED: { label: 'Pago', variant: 'default', icon: CheckCircle2 },
  CONFIRMED: { label: 'Confirmado', variant: 'default', icon: CheckCircle2 },
  OVERDUE: { label: 'Vencido', variant: 'destructive', icon: XCircle },
  REFUNDED: { label: 'Estornado', variant: 'secondary', icon: XCircle },
};

const deliveryStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PROCESSING: { label: 'Em Processamento', variant: 'outline' },
  SHIPPED: { label: 'Enviado', variant: 'default' },
  IN_TRANSIT: { label: 'Em Trânsito', variant: 'secondary' },
  DELIVERED: { label: 'Entregue', variant: 'default' },
  RETURNED: { label: 'Devolvido', variant: 'destructive' },
};

const CustomerDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/cliente/login');
        return;
      }
      setUser(session.user);
      await fetchOrders(session.user.email || '');
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/cliente/login');
  };

  const copyTracking = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Código copiado!' });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/catalogo" className="flex items-center gap-2">
            <img src={logoImg} alt="Liberty Pharma" className="h-10 object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Meus Pedidos</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhe o status dos seus pedidos e entregas</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="py-16 text-center space-y-4">
              <Package className="w-16 h-16 text-muted-foreground/40 mx-auto" />
              <h3 className="text-lg font-semibold text-foreground">Nenhum pedido encontrado</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Seus pedidos aparecerão aqui. Certifique-se de usar o mesmo email do cadastro ao realizar compras.
              </p>
              <Link to="/catalogo">
                <Button className="mt-2">Ver Catálogo</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const paymentStatus = paymentStatusMap[order.status] || { label: order.status, variant: 'outline' as const, icon: Clock };
              const deliveryStatus = deliveryStatusMap[order.delivery_status] || { label: order.delivery_status || 'Em Processamento', variant: 'outline' as const };
              const PaymentIcon = paymentStatus.icon;

              return (
                <Card key={order.id} className="border-border/50 overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{order.product_name}</CardTitle>
                        {order.dosage && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {order.dosage}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Status Row */}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={paymentStatus.variant} className="flex items-center gap-1">
                        <PaymentIcon className="w-3 h-3" />
                        {paymentStatus.label}
                      </Badge>
                      <Badge variant={deliveryStatus.variant} className="flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        {deliveryStatus.label}
                      </Badge>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Quantidade</p>
                        <p className="font-medium text-foreground">{order.quantity}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Valor Total</p>
                        <p className="font-semibold text-primary">
                          R$ {Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Pagamento</p>
                        <p className="font-medium text-foreground capitalize">
                          {order.payment_method === 'credit_card' ? 'Cartão' : order.payment_method?.toUpperCase()}
                          {order.installments > 1 && ` (${order.installments}x)`}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Pedido</p>
                        <p className="font-mono text-xs text-foreground">{order.id.slice(0, 8).toUpperCase()}</p>
                      </div>
                    </div>

                    {/* Shipping Info */}
                    {(order.tracking_code || order.shipping_service) && (
                      <div className="bg-muted/50 border border-border/50 rounded-lg p-3 space-y-3">
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
                            <div className="flex items-center gap-1">
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default CustomerDashboard;
