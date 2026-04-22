import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  RefreshCw,
  Trash2,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ShieldOff,
  MailWarning,
  Send,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type LogRow = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  provider_response: any;
  metadata: any;
  created_at: string;
};

const RANGES: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  all: 0,
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
    sent: { label: "Enviado", className: "bg-emerald-500/15 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    failed: { label: "Falhou", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
    pending: { label: "Pendente", className: "bg-amber-500/15 text-amber-700 border-amber-200", Icon: Clock },
    dlq: { label: "DLQ (falhou)", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
    suppressed: { label: "Suprimido", className: "bg-amber-500/15 text-amber-700 border-amber-200", Icon: ShieldOff },
    bounced: { label: "Devolvido", className: "bg-orange-500/15 text-orange-700 border-orange-200", Icon: MailWarning },
    complained: { label: "Reclamação", className: "bg-purple-500/15 text-purple-700 border-purple-200", Icon: MailWarning },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground", Icon: Mail };
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
};

const EmailLogsPage = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<keyof typeof RANGES>("7d");
  const [template, setTemplate] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<LogRow | null>(null);

  const load = async () => {
    setLoading(true);
    let query = (supabase as any)
      .from("email_send_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (range !== "all") {
      const days = RANGES[range];
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", from);
    }
    if (template !== "all") query = query.eq("template_name", template);
    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      toast({ title: "Erro ao carregar logs", description: error.message, variant: "destructive" });
    } else {
      setRows((data as LogRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, template, status]);

  // Deduplicate by message_id (keep latest row per message)
  const dedupedRows = useMemo(() => {
    const map = new Map<string, LogRow>();
    for (const row of rows) {
      const key = row.message_id ?? row.id;
      if (!map.has(key)) map.set(key, row);
    }
    return Array.from(map.values());
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return dedupedRows;
    return dedupedRows.filter(
      (r) =>
        r.recipient_email.toLowerCase().includes(term) ||
        (r.message_id ?? "").toLowerCase().includes(term) ||
        (r.subject ?? "").toLowerCase().includes(term) ||
        r.template_name.toLowerCase().includes(term),
    );
  }, [dedupedRows, search]);

  const stats = useMemo(() => {
    const total = dedupedRows.length;
    const sent = dedupedRows.filter((r) => r.status === "sent").length;
    const failed = dedupedRows.filter((r) => r.status === "failed" || r.status === "dlq").length;
    const suppressed = dedupedRows.filter(
      (r) => r.status === "suppressed" || r.status === "bounced" || r.status === "complained",
    ).length;
    const pending = dedupedRows.filter((r) => r.status === "pending").length;
    return {
      total,
      sent,
      failed,
      suppressed,
      pending,
      rate: total > 0 ? Math.round((sent / total) * 100) : 0,
    };
  }, [dedupedRows]);

  const templateOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.template_name));
    return Array.from(set).sort();
  }, [rows]);

  const handleClearOld = async () => {
    if (!confirm("Excluir logs com mais de 30 dias?")) return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await (supabase as any)
      .from("email_send_log")
      .delete()
      .lt("created_at", cutoff);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logs antigos removidos" });
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-7 w-7" />
            Logs de Email
          </h1>
          <p className="text-muted-foreground mt-1">
            Histórico de envios da função send-email
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleClearOld}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar &gt; 30d
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Mail className="h-4 w-4" /> Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">emails únicos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" /> Enviados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.sent}</div>
            <p className="text-xs text-muted-foreground mt-1">entregues ao SMTP</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Falhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.failed}</div>
            <p className="text-xs text-muted-foreground mt-1">failed + dlq</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShieldOff className="h-4 w-4" /> Suprimidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{stats.suppressed}</div>
            <p className="text-xs text-muted-foreground mt-1">bounce/spam/opt-out</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Taxa de Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.rate}%</div>
            <p className="text-xs text-muted-foreground mt-1">enviados / total</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={range} onValueChange={(v) => setRange(v as keyof typeof RANGES)}>
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os templates</SelectItem>
              {templateOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por email, assunto, ID..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Histórico ({filteredRows.length}
            {filteredRows.length !== dedupedRows.length ? ` de ${dedupedRows.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum envio registrado neste período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Message ID</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(row.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.template_name}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.recipient_email}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {row.subject ?? "—"}
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[160px] truncate">
                        {row.message_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetail(row)}>
                          Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do envio</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Template:</span>{" "}
                <span className="font-medium">{detail.template_name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Destinatário:</span>{" "}
                <span className="font-medium">{detail.recipient_email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Assunto:</span>{" "}
                {detail.subject ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                {statusBadge(detail.status)}
              </div>
              <div>
                <span className="text-muted-foreground">Message ID:</span>{" "}
                <code className="text-xs">{detail.message_id ?? "—"}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Data:</span>{" "}
                {format(new Date(detail.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
              </div>
              {detail.error_message && (
                <div>
                  <div className="text-muted-foreground mb-1">Erro:</div>
                  <pre className="bg-destructive/10 text-destructive p-3 rounded-md text-xs whitespace-pre-wrap">
                    {detail.error_message}
                  </pre>
                </div>
              )}
              {detail.metadata && (
                <div>
                  <div className="text-muted-foreground mb-1">Metadata:</div>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-auto">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
              {detail.provider_response && (
                <div>
                  <div className="text-muted-foreground mb-1">Resposta do provedor:</div>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-auto">
                    {JSON.stringify(detail.provider_response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailLogsPage;
