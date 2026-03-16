import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Mail, ShoppingCart, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

  const totalEmails = logs.length;
  const uniqueUsers = new Set(logs.map((l) => l.user_id)).size;
  const totalItems = logs.reduce((sum, l) => sum + l.cart_item_count, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Recuperação de Carrinho</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-full bg-primary/10 p-3">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Itens Abandonados</p>
              <p className="text-2xl font-bold text-foreground">{totalItems}</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
              {/* Desktop table */}
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

              {/* Mobile cards */}
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
    </div>
  );
}
