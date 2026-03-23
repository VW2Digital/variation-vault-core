import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, ShoppingCart, Users, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActiveCartUser {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  items: {
    product_name: string;
    dosage: string;
    quantity: number;
    price: number;
  }[];
  total_items: number;
  total_value: number;
  oldest_item_date: string;
}

export default function CartAbandonmentLogsPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['cart-abandonment-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cart_abandonment_logs')
        .select('*')
        .order('email_sent_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: activeCartsData = [], isLoading: isLoadingCarts } = useQuery({
    queryKey: ['active-abandoned-carts'],
    queryFn: async () => {
      const { data: cartItems, error: cartError } = await supabase
        .from('cart_items')
        .select(`
          user_id,
          quantity,
          created_at,
          product_id,
          variation_id,
          products (name),
          product_variations (dosage, price, offer_price, is_offer)
        `)
        .order('created_at', { ascending: true });
      if (cartError) throw cartError;
      if (!cartItems || cartItems.length === 0) return [];

      const userIds = [...new Set(cartItems.map(ci => ci.user_id))];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone, cpf');

      const { data: recentOrders } = await supabase
        .from('orders')
        .select('customer_user_id, status')
        .in('customer_user_id', userIds)
        .in('status', ['PAID', 'CONFIRMED', 'RECEIVED']);

      const paidUserIds = new Set((recentOrders || []).map(o => o.customer_user_id));

      let userEmails: Record<string, string> = {};
      try {
        const { data: usersData } = await supabase.functions.invoke('admin-users', {
          method: 'GET',
        });
        if (usersData?.users) {
          for (const u of usersData.users) {
            userEmails[u.id] = u.email || '';
          }
        }
      } catch {
        // fallback
      }

      const userMap = new Map<string, ActiveCartUser>();
      for (const item of cartItems) {
        if (paidUserIds.has(item.user_id)) continue;

        const product = item.products as any;
        const variation = item.product_variations as any;
        const price = variation?.is_offer && variation?.offer_price ? variation.offer_price : (variation?.price || 0);

        if (!userMap.has(item.user_id)) {
          const profile = (profiles || []).find(p => p.user_id === item.user_id);
          userMap.set(item.user_id, {
            user_id: item.user_id,
            email: userEmails[item.user_id] || '',
            full_name: profile?.full_name || 'Não informado',
            phone: profile?.phone || '',
            items: [],
            total_items: 0,
            total_value: 0,
            oldest_item_date: item.created_at,
          });
        }

        const user = userMap.get(item.user_id)!;
        user.items.push({
          product_name: product?.name || 'Produto',
          dosage: variation?.dosage || '',
          quantity: item.quantity,
          price,
        });
        user.total_items += item.quantity;
        user.total_value += price * item.quantity;
        if (item.created_at < user.oldest_item_date) {
          user.oldest_item_date = item.created_at;
        }
      }

      return Array.from(userMap.values()).sort(
        (a, b) => b.total_value - a.total_value
      );
    },
  });

  const totalEmails = logs.length;
  const uniqueUsers = new Set(logs.map((l) => l.user_id)).size;
  const totalItems = logs.reduce((sum, l) => sum + l.cart_item_count, 0);
  const activeCartUsers = activeCartsData.length;
  const activeCartValue = activeCartsData.reduce((sum, u) => sum + u.total_value, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Recuperação de Carrinho</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Carrinhos Ativos</p>
              <p className="text-2xl font-bold text-foreground">{activeCartUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-full bg-primary/10 p-3">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valor Abandonado</p>
              <p className="text-2xl font-bold text-foreground">
                R$ {activeCartValue.toFixed(2).replace('.', ',')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Emails Enviados</p>
              <p className="text-2xl font-bold text-foreground">{totalEmails}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Usuários Impactados</p>
              <p className="text-2xl font-bold text-foreground">{uniqueUsers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            Carrinhos Abandonados ({activeCartUsers})
          </TabsTrigger>
          <TabsTrigger value="history">
            Histórico de Envios ({totalEmails})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Usuários com Itens no Carrinho (sem compra)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingCarts ? (
                <p className="text-muted-foreground text-center py-8">Carregando...</p>
              ) : activeCartsData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum carrinho abandonado no momento.</p>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Produtos</TableHead>
                          <TableHead className="text-center">Qtd</TableHead>
                          <TableHead className="text-right">Valor Total</TableHead>
                          <TableHead>Desde</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeCartsData.map((user) => (
                          <TableRow key={user.user_id}>
                            <TableCell className="font-medium">{user.full_name}</TableCell>
                            <TableCell className="text-sm">{user.email || '—'}</TableCell>
                            <TableCell className="text-sm">{user.phone || '—'}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {user.items.map((item, i) => (
                                  <div key={i} className="text-sm">
                                    {item.product_name}
                                    {item.dosage && <span className="text-muted-foreground"> ({item.dosage})</span>}
                                    <span className="text-muted-foreground"> x{item.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{user.total_items}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              R$ {user.total_value.toFixed(2).replace('.', ',')}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(user.oldest_item_date), "dd/MM/yyyy", { locale: ptBR })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="md:hidden space-y-3">
                    {activeCartsData.map((user) => (
                      <div key={user.user_id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{user.full_name}</p>
                            <p className="text-sm text-muted-foreground">{user.email || '—'}</p>
                            {user.phone && <p className="text-sm text-muted-foreground">{user.phone}</p>}
                          </div>
                          <Badge variant="destructive">{user.total_items} {user.total_items === 1 ? 'item' : 'itens'}</Badge>
                        </div>
                        <div className="space-y-1 border-t pt-2">
                          {user.items.map((item, i) => (
                            <div key={i} className="text-sm flex justify-between">
                              <span>
                                {item.product_name}
                                {item.dosage && <span className="text-muted-foreground"> ({item.dosage})</span>}
                                <span className="text-muted-foreground"> x{item.quantity}</span>
                              </span>
                              <span className="font-medium">R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center border-t pt-2">
                          <span className="text-sm text-muted-foreground">
                            Desde {format(new Date(user.oldest_item_date), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                          <span className="font-bold text-primary">
                            R$ {user.total_value.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Envios</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground text-center py-8">Carregando...</p>
              ) : logs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum email de recuperação enviado ainda.</p>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>Usuário</TableHead>
                          <TableHead className="text-center">Itens no Carrinho</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              {format(new Date(log.email_sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{log.user_id.slice(0, 8)}...</TableCell>
                            <TableCell className="text-center">{log.cart_item_count}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="bg-green-100 text-green-800">Enviado</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="md:hidden space-y-3">
                    {logs.map((log) => (
                      <div key={log.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(log.email_sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">Enviado</Badge>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Usuário: </span>
                          <span className="font-mono text-xs">{log.user_id.slice(0, 8)}...</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Itens: </span>
                          <span className="font-semibold">{log.cart_item_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
