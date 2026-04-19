import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  RefreshCw,
  Eye,
  RotateCcw,
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';

interface HookItem {
  id: string;
  url?: string;
  event?: string;
  status?: string;
  attempts?: number;
  response_status?: number | string;
  created_at?: string;
  last_attempt?: string;
  account?: { id?: string; name?: string };
  // Pagar.me payload may have nested objects
  [k: string]: any;
}

interface ListResponse {
  data?: HookItem[];
  paging?: { total?: number; previous?: string; next?: string };
}

const statusColor = (s?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const v = (s || '').toLowerCase();
  if (v.includes('success') || v === 'delivered' || v === 'ok') return 'default';
  if (v.includes('fail') || v.includes('error')) return 'destructive';
  if (v.includes('pending') || v.includes('processing')) return 'secondary';
  return 'outline';
};

const StatusIcon = ({ status }: { status?: string }) => {
  const v = (status || '').toLowerCase();
  if (v.includes('success') || v === 'delivered') return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (v.includes('fail') || v.includes('error')) return <XCircle className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
};

const formatDate = (s?: string) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('pt-BR');
  } catch {
    return s;
  }
};

const PagarMeWebhooksPanel = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [hooks, setHooks] = useState<HookItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [hookIdInput, setHookIdInput] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<HookItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const callAdmin = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('pagarme-webhooks-admin', {
      body: payload,
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const loadHooks = async () => {
    setLoading(true);
    try {
      const res: { data: ListResponse } = await callAdmin({
        action: 'list',
        size: 30,
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setHooks(list);
      if (!list.length) {
        toast({
          title: 'Nenhum webhook encontrado',
          description: 'A Pagar.me não retornou webhooks recentes para esta conta.',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Falha ao listar webhooks',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (hookId: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await callAdmin({ action: 'get', hook_id: hookId });
      setDetail(res?.data || null);
    } catch (err: any) {
      toast({
        title: 'Falha ao carregar detalhes',
        description: err.message,
        variant: 'destructive',
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const resendHook = async (hookId: string) => {
    setResendingId(hookId);
    try {
      await callAdmin({ action: 'resend', hook_id: hookId });
      toast({
        title: 'Webhook reenviado',
        description: 'A Pagar.me confirmou a solicitação de reenvio.',
      });
      // Refresh after a brief moment so the new attempt shows up
      setTimeout(() => loadHooks(), 800);
    } catch (err: any) {
      toast({
        title: 'Falha ao reenviar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setResendingId(null);
    }
  };

  useEffect(() => {
    loadHooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Webhook className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Diagnóstico de Webhooks</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar status (ex: failed)"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-44 h-9 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={loadHooks}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-2">Atualizar</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Lista os webhooks (notificações de eventos) que a Pagar.me tentou entregar para
          este projeto. Use <strong>Detalhes</strong> para inspecionar a tentativa e
          <strong> Reenviar</strong> para forçar uma nova tentativa de entrega.
        </p>

        {/* Manual lookup */}
        <div className="rounded-md border border-border/50 p-3 space-y-2">
          <Label className="text-xs">Consultar webhook por ID</Label>
          <div className="flex gap-2">
            <Input
              placeholder="hook_xxxxxxxxxx"
              value={hookIdInput}
              onChange={(e) => setHookIdInput(e.target.value)}
              className="h-9 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!hookIdInput.trim()}
              onClick={() => openDetail(hookIdInput.trim())}
            >
              <Eye className="w-4 h-4 mr-2" />
              Ver
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="border border-border/50 rounded-md overflow-hidden">
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">ID</th>
                  <th className="text-left p-2 font-medium">Evento</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">Resp.</th>
                  <th className="text-left p-2 font-medium">Tentativas</th>
                  <th className="text-left p-2 font-medium">Última tentativa</th>
                  <th className="text-right p-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Carregando webhooks...
                    </td>
                  </tr>
                ) : hooks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Nenhum webhook para exibir.
                    </td>
                  </tr>
                ) : (
                  hooks.map((h) => (
                    <tr key={h.id} className="border-t border-border/40 hover:bg-muted/30">
                      <td className="p-2 font-mono break-all max-w-[160px]">{h.id}</td>
                      <td className="p-2">{h.event || '—'}</td>
                      <td className="p-2">
                        <Badge variant={statusColor(h.status)} className="gap-1">
                          <StatusIcon status={h.status} />
                          {h.status || '—'}
                        </Badge>
                      </td>
                      <td className="p-2">{h.response_status ?? '—'}</td>
                      <td className="p-2">{h.attempts ?? '—'}</td>
                      <td className="p-2">{formatDate(h.last_attempt || h.created_at)}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openDetail(h.id)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => resendHook(h.id)}
                          disabled={resendingId === h.id}
                        >
                          {resendingId === h.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5" />
              Detalhes do Webhook
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Buscando na Pagar.me...
            </div>
          ) : detail ? (
            <div className="space-y-3 overflow-auto flex-1">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-xs text-muted-foreground">ID</Label>
                  <p className="font-mono break-all">{detail.id}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Evento</Label>
                  <p>{detail.event || '—'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <p>
                    <Badge variant={statusColor(detail.status)}>{detail.status || '—'}</Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tentativas</Label>
                  <p>{detail.attempts ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">URL alvo</Label>
                  <p className="break-all font-mono text-xs">{detail.url || '—'}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Payload completo (Pagar.me)
                </Label>
                <pre className="bg-muted text-xs p-3 rounded max-h-[40vh] overflow-auto font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(detail, null, 2)}
                </pre>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => resendHook(detail.id)}
                  disabled={resendingId === detail.id}
                >
                  {resendingId === detail.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Reenviar webhook
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">Nenhum dado.</p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PagarMeWebhooksPanel;
