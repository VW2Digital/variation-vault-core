import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Search, Trash2, RefreshCw } from 'lucide-react';

interface PaymentLog {
  id: string;
  order_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  payment_method: string | null;
  error_message: string;
  error_source: string;
  request_payload: any;
  created_at: string;
}

const PaymentLogsPage = () => {
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payment_logs' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleDelete = async (id: string) => {
    await supabase.from('payment_logs' as any).delete().eq('id', id);
    setLogs(prev => prev.filter(l => l.id !== id));
  };

  const handleClearAll = async () => {
    if (!confirm('Tem certeza que deseja limpar todos os logs?')) return;
    for (const log of logs) {
      await supabase.from('payment_logs' as any).delete().eq('id', log.id);
    }
    setLogs([]);
  };

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.error_message?.toLowerCase().includes(q) ||
      l.customer_email?.toLowerCase().includes(q) ||
      l.customer_name?.toLowerCase().includes(q) ||
      l.payment_method?.toLowerCase().includes(q)
    );
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-destructive" />
            Falhas de Pagamento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          {logs.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              <Trash2 className="w-4 h-4 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por email, nome, erro..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {loading ? 'Carregando...' : 'Nenhuma falha de pagamento registrada.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Data/Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-[100px]">Método</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="w-[90px]">Origem</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{log.customer_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{log.customer_email || ''}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.payment_method === 'credit_card' ? 'default' : 'secondary'} className="text-xs">
                          {log.payment_method === 'credit_card' ? 'Cartão' : log.payment_method === 'pix' ? 'PIX' : log.payment_method || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-destructive font-medium line-clamp-2">{log.error_message}</p>
                        {log.request_payload && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                              Ver payload
                            </summary>
                            <pre className="text-[10px] bg-muted p-2 rounded mt-1 max-h-24 overflow-auto whitespace-pre-wrap">
                              {JSON.stringify(log.request_payload, null, 2)}
                            </pre>
                          </details>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {log.error_source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)} className="h-7 w-7">
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PaymentLogsPage;
