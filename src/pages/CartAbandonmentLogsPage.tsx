import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Mail, ShoppingCart, Users, AlertTriangle, MessageCircle, CalendarIcon, X, Loader2, RefreshCw, Send } from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

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

  const { data: activeCartsData = [], isLoading: isLoadingCarts, refetch: refetchCarts } = useQuery({
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

      let userEmails: Record<string, string> = {};
      try {
        const { data: usersData } = await supabase.functions.invoke('admin-users', {
          method: 'GET',
        });
        const usersList = Array.isArray(usersData)
          ? usersData
          : (usersData?.users ?? []);
        for (const u of usersList) {
          if (u?.id) userEmails[u.id] = u.email || '';
        }
      } catch {
        // fallback
      }

      const userMap = new Map<string, ActiveCartUser>();
      for (const item of cartItems) {

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

  const filteredCarts = dateRange?.from
    ? activeCartsData.filter((user) => {
        const itemDate = new Date(user.oldest_item_date);
        const from = startOfDay(dateRange.from!);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from!);
        return isWithinInterval(itemDate, { start: from, end: to });
      })
    : activeCartsData;

  const handleSendWhatsApp = async (user: ActiveCartUser) => {
    if (!user.phone) {
      toast.error('Este usuário não possui telefone cadastrado.');
      return;
    }

    setSendingWhatsApp(user.user_id);

    const productsList = user.items
      .map(item => `• ${item.product_name}${item.dosage ? ` (${item.dosage})` : ''} x${item.quantity}`)
      .join('\n');

    const message = `Olá ${user.full_name}! 😊\n\nNotamos que você tem itens no seu carrinho:\n\n${productsList}\n\n💰 Total: R$ ${user.total_value.toFixed(2).replace('.', ',')}\n\nPrecisa de ajuda para finalizar sua compra? Estamos à disposição! 🛒`;

    try {
      const { data, error } = await supabase.functions.invoke('evolution-send-message', {
        body: { number: user.phone, text: message },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Mensagem enviada para ${user.full_name}!`);
    } catch (err: any) {
      toast.error(`Erro ao enviar: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const handleSendEmail = async (user: ActiveCartUser) => {
    if (!user.email) {
      toast.error('Este cliente não possui email cadastrado.');
      return;
    }
    setSendingEmail(user.user_id);
    try {
      const { data, error } = await supabase.functions.invoke('cart-abandonment-send', {
        body: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          items: user.items,
          total_value: user.total_value,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        data?.fallback
          ? `Email enviado para ${user.email} (via domínio público de teste).`
          : `Email enviado para ${user.email}!`
      );
    } catch (err: any) {
      toast.error(`Erro ao enviar email: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSendingEmail(null);
    }
  };

  const totalEmails = logs.length;
  const uniqueUsers = new Set(logs.map((l) => l.user_id)).size;
  const totalItems = logs.reduce((sum, l) => sum + l.cart_item_count, 0);
  const activeCartUsers = filteredCarts.length;
  const activeCartValue = filteredCarts.reduce((sum, u) => sum + u.total_value, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Recuperação de Carrinho</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-destructive/10 p-2.5 shrink-0">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Carrinhos Ativos</p>
              <p className="text-xl font-bold text-foreground">{activeCartUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Valor Abandonado</p>
              <p className="text-xl font-bold text-foreground">
                R$ {activeCartValue.toFixed(2).replace('.', ',')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Emails Enviados</p>
              <p className="text-xl font-bold text-foreground">{totalEmails}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Usuários Impactados</p>
              <p className="text-xl font-bold text-foreground">{uniqueUsers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="active" className="text-xs sm:text-sm">
            Abandonados ({activeCartUsers})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">
            Histórico ({totalEmails})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardHeader className="space-y-3 pb-4">
              <CardTitle className="text-lg">Usuários com Itens no Carrinho (sem compra)</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => refetchCarts()}
                  disabled={isLoadingCarts}
                >
                  <RefreshCw className={cn("h-4 w-4", isLoadingCarts && "animate-spin")} />
                  Atualizar
                </Button>
                {dateRange?.from && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDateRange(undefined)}
                    className="h-8 px-2 text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Limpar
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 justify-start text-left font-normal",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} -{" "}
                            {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                        )
                      ) : (
                        "Filtrar por data"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={1}
                      locale={ptBR}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingCarts ? (
                <p className="text-muted-foreground text-center py-8">Carregando...</p>
              ) : filteredCarts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum carrinho abandonado no momento.</p>
              ) : (
                <>
                  {/* Desktop */}
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
                          <TableHead className="text-center">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCarts.map((user) => (
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
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800"
                                  disabled={!user.phone || sendingWhatsApp === user.user_id}
                                  onClick={() => handleSendWhatsApp(user)}
                                  title={!user.phone ? 'Sem telefone cadastrado' : 'Enviar via WhatsApp'}
                                >
                                  {sendingWhatsApp === user.user_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MessageCircle className="h-4 w-4" />
                                  )}
                                  WhatsApp
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                                  disabled={!user.email || sendingEmail === user.user_id}
                                  onClick={() => handleSendEmail(user)}
                                  title={!user.email ? 'Sem email cadastrado' : 'Enviar email de recuperação'}
                                >
                                  {sendingEmail === user.user_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Mail className="h-4 w-4" />
                                  )}
                                  Email
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden space-y-3">
                    {filteredCarts.map((user) => (
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800"
                          disabled={!user.phone || sendingWhatsApp === user.user_id}
                          onClick={() => handleSendWhatsApp(user)}
                        >
                          {sendingWhatsApp === user.user_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageCircle className="h-4 w-4" />
                          )}
                          {user.phone ? 'Enviar WhatsApp' : 'Sem telefone'}
                        </Button>
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
