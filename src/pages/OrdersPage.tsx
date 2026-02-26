import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Receipt, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

const billingTypeMap: Record<string, string> = {
  CREDIT_CARD: 'Cartão de Crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  UNDEFINED: '-',
};

const OrdersPage = () => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('asaas-checkout', {
        body: { action: 'list_payments' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setPayments(data?.data || []);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar pedidos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
        <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Receipt className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
          <p className="text-xs text-muted-foreground">Os pedidos aparecerão aqui quando pagamentos forem realizados via Asaas.</p>
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: any) => {
                  const status = statusMap[p.status] || { label: p.status, variant: 'outline' as const };
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(p.dateCreated).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-sm font-medium max-w-[150px] truncate">
                        {p.customerName || p.customer || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {p.description || '-'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {billingTypeMap[p.billingType] || p.billingType}
                      </TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">
                        R$ {Number(p.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
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
