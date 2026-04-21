import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert, Trash2, RefreshCw, Eye, Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';

type WebhookLog = {
  id: string;
  gateway: string;
  event_type: string | null;
  http_status: number;
  latency_ms: number | null;
  signature_valid: boolean | null;
  signature_error: string | null;
  order_id: string | null;
  external_id: string | null;
  request_payload: any;
  error_message: string | null;
  created_at: string;
};

const GATEWAY_LABELS: Record<string, string> = {
  asaas: 'Asaas',
  mercadopago: 'Mercado Pago',
  pagarme: 'Pagar.me',
  pagbank: 'PagBank',
  'melhor-envio': 'Melhor Envio',
};

const GATEWAY_COLORS: Record<string, string> = {
  asaas: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  mercadopago: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  pagarme: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  pagbank: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'melhor-envio': 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
};

// Códigos de erro conhecidos (E-WBH-XXXX do Melhor Envio, etc)
// Detecta no error_message ou no payload bruto.
const ERROR_CODE_REGEX = /\bE-[A-Z]+-\d{4}\b/g;

const extractErrorCodes = (log: WebhookLog): string[] => {
  const haystack = [
    log.error_message || '',
    log.signature_error || '',
    typeof log.request_payload === 'string'
      ? log.request_payload
      : JSON.stringify(log.request_payload || {}),
  ].join(' ');
  const matches = haystack.match(ERROR_CODE_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
};

export default function WebhookLogsPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayFilter, setGatewayFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<WebhookLog | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      toast.error('Erro ao carregar logs: ' + error.message);
    } else {
      setLogs((data as WebhookLog[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Realtime subscription
    const ch = supabase
      .channel('webhook_logs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'webhook_logs' }, (payload) => {
        setLogs((prev) => [payload.new as WebhookLog, ...prev].slice(0, 200));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (gatewayFilter !== 'all' && l.gateway !== gatewayFilter) return false;
      if (statusFilter === 'errors' && !l.error_message && l.signature_valid !== false) return false;
      if (statusFilter === 'signature_failed' && l.signature_valid !== false) return false;
      if (statusFilter === 'success' && (l.error_message || l.signature_valid === false)) return false;
      return true;
    });
  }, [logs, gatewayFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = logs.length;
    const errors = logs.filter((l) => l.error_message).length;
    const sigFailed = logs.filter((l) => l.signature_valid === false).length;
    const success = total - errors - sigFailed;
    const avgLatency = logs.length
      ? Math.round(logs.reduce((a, l) => a + (l.latency_ms || 0), 0) / logs.length)
      : 0;
    return { total, errors, sigFailed, success, avgLatency };
  }, [logs]);

  const clearOld = async () => {
    if (!confirm('Excluir TODOS os logs com mais de 7 dias? Esta ação é permanente.')) return;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('webhook_logs').delete().lt('created_at', cutoff);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Logs antigos removidos'); load(); }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };

  const statusBadge = (log: WebhookLog) => {
    if (log.signature_valid === false) {
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1"><ShieldAlert className="h-3 w-3" />Assinatura inválida</Badge>;
    }
    if (log.error_message) {
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1"><AlertTriangle className="h-3 w-3" />Erro</Badge>;
    }
    return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1"><CheckCircle2 className="h-3 w-3" />OK</Badge>;
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs de Webhooks</h1>
          <p className="text-sm text-muted-foreground">Eventos recebidos dos gateways em tempo real</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={clearOld}>
            <Trash2 className="h-4 w-4" /> Limpar &gt; 7 dias
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">OK</p><p className="text-2xl font-bold text-primary">{stats.success}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Assinatura inválida</p><p className="text-2xl font-bold text-destructive">{stats.sigFailed}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Erros</p><p className="text-2xl font-bold text-destructive">{stats.errors}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Latencia media</p><p className="text-2xl font-bold">{stats.avgLatency}ms</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Eventos recentes</CardTitle>
            <div className="flex gap-2">
              <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos gateways</SelectItem>
                  {Object.entries(GATEWAY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="success">Apenas OK</SelectItem>
                  <SelectItem value="errors">Apenas erros</SelectItem>
                  <SelectItem value="signature_failed">Assinatura inválida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum evento encontrado.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 hover:border-border transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={GATEWAY_COLORS[log.gateway] || ''}>{GATEWAY_LABELS[log.gateway] || log.gateway}</Badge>
                      {statusBadge(log)}
                      <span className="text-xs text-muted-foreground">HTTP {log.http_status}</span>
                      {log.latency_ms !== null && <span className="text-xs text-muted-foreground">• {log.latency_ms}ms</span>}
                      <span className="text-xs text-muted-foreground">• {formatTime(log.created_at)}</span>
                    </div>
                    <div className="text-sm">
                      {log.event_type && <span className="font-medium">{log.event_type}</span>}
                      {log.external_id && <span className="text-muted-foreground"> • ID: {log.external_id}</span>}
                    </div>
                    {log.order_id && (
                      <div className="text-xs text-muted-foreground font-mono">Pedido: {log.order_id}</div>
                    )}
                    {log.signature_error && (
                      <div className="text-xs text-destructive">🛡 {log.signature_error}</div>
                    )}
                    {log.error_message && (
                      <div className="text-xs text-destructive truncate">⚠ {log.error_message}</div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(log)} className="shrink-0">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Detalhes do evento</DialogTitle>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">Gateway</p><p className="font-medium">{GATEWAY_LABELS[selected.gateway] || selected.gateway}</p></div>
                  <div><p className="text-xs text-muted-foreground">Evento</p><p className="font-medium">{selected.event_type || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">HTTP Status</p><p className="font-medium">{selected.http_status}</p></div>
                  <div><p className="text-xs text-muted-foreground">Latência</p><p className="font-medium">{selected.latency_ms ?? '—'}ms</p></div>
                  <div><p className="text-xs text-muted-foreground">Assinatura válida</p><p className="font-medium">{selected.signature_valid === null ? 'N/A' : selected.signature_valid ? 'Sim' : 'Não'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Quando</p><p className="font-medium">{formatTime(selected.created_at)}</p></div>
                </div>
                {selected.signature_error && (
                  <div><p className="text-xs text-muted-foreground">Erro de assinatura</p><p className="text-destructive">{selected.signature_error}</p></div>
                )}
                {selected.error_message && (
                  <div><p className="text-xs text-muted-foreground">Erro</p><p className="text-destructive">{selected.error_message}</p></div>
                )}
                {selected.order_id && (
                  <div><p className="text-xs text-muted-foreground">Pedido vinculado</p><p className="font-mono text-xs">{selected.order_id}</p></div>
                )}
                {selected.external_id && (
                  <div><p className="text-xs text-muted-foreground">ID externo (gateway)</p><p className="font-mono text-xs">{selected.external_id}</p></div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Payload</p>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.request_payload, null, 2)}
                  </pre>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}