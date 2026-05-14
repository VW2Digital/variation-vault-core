import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2, Link2, BarChart3 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/badge";

type Reseller = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  commission_percent: number;
  active: boolean;
  notes: string | null;
  created_at: string;
};

type Stat = {
  reseller_id: string;
  total_orders: number;
  total_paid_orders: number;
  total_paid_value: number;
  total_commission: number;
  top_product: string | null;
  visits: number;
  unique_sessions: number;
  checkout_started: number;
  payment_failed: number;
};

const PAID = ["PAID", "CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

const emptyForm = {
  code: "",
  name: "",
  email: "",
  phone: "",
  commission_percent: 10,
  active: true,
  notes: "",
};

export default function ResellersPage() {
  const [items, setItems] = useState<Reseller[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reseller | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Reseller | null>(null);
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [detailEvents, setDetailEvents] = useState<any[]>([]);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: r } = await supabase
      .from("resellers" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const list = (r as any as Reseller[]) || [];
    setItems(list);

    if (list.length) {
      const ids = list.map((x) => x.id);
      const { data: orders } = await supabase
        .from("orders")
        .select("reseller_id, status, total_value, reseller_commission, product_name")
        .in("reseller_id", ids as any);
      const map: Record<string, Stat> = {};
      list.forEach((it) => {
        map[it.id] = {
          reseller_id: it.id,
          total_orders: 0,
          total_paid_orders: 0,
          total_paid_value: 0,
          total_commission: 0,
          top_product: null,
          visits: 0,
          unique_sessions: 0,
          checkout_started: 0,
          payment_failed: 0,
        };
      });
      const productCount: Record<string, Record<string, number>> = {};
      (orders || []).forEach((o: any) => {
        const s = map[o.reseller_id];
        if (!s) return;
        s.total_orders += 1;
        const isPaid = PAID.includes(String(o.status || "").toUpperCase());
        if (isPaid) {
          s.total_paid_orders += 1;
          s.total_paid_value += Number(o.total_value || 0);
          s.total_commission += Number(o.reseller_commission || 0);
          const pc = (productCount[o.reseller_id] = productCount[o.reseller_id] || {});
          if (o.product_name) pc[o.product_name] = (pc[o.product_name] || 0) + 1;
        }
      });
      Object.keys(productCount).forEach((rid) => {
        const sorted = Object.entries(productCount[rid]).sort((a, b) => b[1] - a[1]);
        if (sorted[0]) map[rid].top_product = `${sorted[0][0]} (${sorted[0][1]})`;
      });

      // Funnel events
      const { data: events } = await supabase
        .from("reseller_events" as any)
        .select("reseller_id, event_type, session_id")
        .in("reseller_id", ids as any);
      const sessionsByReseller: Record<string, Set<string>> = {};
      (events || []).forEach((e: any) => {
        const s = map[e.reseller_id];
        if (!s) return;
        if (e.event_type === "visit") s.visits += 1;
        if (e.event_type === "checkout_started") s.checkout_started += 1;
        if (e.event_type === "payment_failed") s.payment_failed += 1;
        if (e.session_id) {
          (sessionsByReseller[e.reseller_id] ||= new Set()).add(e.session_id);
        }
      });
      Object.keys(sessionsByReseller).forEach((rid) => {
        if (map[rid]) map[rid].unique_sessions = sessionsByReseller[rid].size;
      });
      setStats(map);
    } else {
      setStats({});
    }
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(r: Reseller) {
    setEditing(r);
    setForm({
      code: r.code,
      name: r.name,
      email: r.email || "",
      phone: r.phone || "",
      commission_percent: Number(r.commission_percent || 0),
      active: r.active,
      notes: r.notes || "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Código e nome são obrigatórios");
      return;
    }
    const codeNorm = form.code.trim().replace(/\s+/g, "-");
    setSaving(true);
    const payload: any = {
      code: codeNorm,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      commission_percent: Number(form.commission_percent) || 0,
      active: form.active,
      notes: form.notes.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("resellers" as any).update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("resellers" as any).insert(payload));
    }
    setSaving(false);
    if (error) {
      const msg = String(error.message || "");
      toast.error(msg.includes("duplicate") || msg.includes("unique") ? "Código já está em uso" : "Erro ao salvar");
      return;
    }
    toast.success(editing ? "Revendedor atualizado" : "Revendedor criado");
    setOpen(false);
    void load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("resellers" as any).delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    toast.success("Revendedor excluído");
    void load();
  }

  function copyLink(code: string) {
    const url = `${baseUrl}/?ref=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  }

  async function openDetail(r: Reseller) {
    setDetail(r);
    const { data } = await supabase
      .from("orders")
      .select("id,created_at,product_name,status,total_value,reseller_commission,customer_name")
      .eq("reseller_id", r.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setDetailOrders(data || []);
    const { data: ev } = await supabase
      .from("reseller_events" as any)
      .select("created_at,event_type,product_name,amount,session_id,metadata")
      .eq("reseller_id", r.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setDetailEvents((ev as any[]) || []);
  }

  const totals = useMemo(() => {
    const t = { value: 0, commission: 0, paid: 0, visits: 0, started: 0, failed: 0 };
    Object.values(stats).forEach((s) => {
      t.value += s.total_paid_value;
      t.commission += s.total_commission;
      t.paid += s.total_paid_orders;
      t.visits += s.visits;
      t.started += s.checkout_started;
      t.failed += s.payment_failed;
    });
    return t;
  }, [stats]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Revendedores"
        description="Cadastre revendedores, gere links únicos e acompanhe vendas e comissões."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Novo revendedor
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Visitas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.visits}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Checkouts iniciados</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.started}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pagamentos falhos</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.failed}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vendas pagas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.paid}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Faturamento atribuído</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">R$ {totals.value.toFixed(2)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Comissões a pagar</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">R$ {totals.commission.toFixed(2)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum revendedor cadastrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código / Nome</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Pedidos pagos</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Comissão acumulada</TableHead>
                  <TableHead>Top produto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const s = stats[r.id];
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.code}</div>
                      </TableCell>
                      <TableCell>{Number(r.commission_percent).toFixed(2)}%</TableCell>
                      <TableCell>{s?.total_paid_orders ?? 0}</TableCell>
                      <TableCell>R$ {(s?.total_paid_value ?? 0).toFixed(2)}</TableCell>
                      <TableCell>R$ {(s?.total_commission ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{s?.top_product ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.active ? "default" : "secondary"}>
                          {r.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => copyLink(r.code)} title="Copiar link">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openDetail(r)} title="Detalhes">
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" title="Excluir">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir revendedor?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação é permanente. Pedidos antigos manterão o histórico do código vendido, mas não terão mais o cadastro vinculado.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(r.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar revendedor" : "Novo revendedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Código (usado no link, ex: joao)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="joao"
              />
              {form.code && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  {baseUrl}/?ref={form.code.trim()}
                </p>
              )}
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Comissão (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.commission_percent}
                onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="reseller-active">Ativo</Label>
              <Switch
                id="reseller-active"
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.name} — últimos pedidos</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 overflow-x-auto">
            <div>
              <h3 className="text-sm font-semibold mb-2">Eventos do funil (últimos 50)</h3>
              {detailEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Sessão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailEvents.map((e: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell><Badge variant="secondary">{e.event_type}</Badge></TableCell>
                        <TableCell className="text-xs">{e.product_name || "—"}</TableCell>
                        <TableCell className="text-xs">{e.amount ? `R$ ${Number(e.amount).toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{e.session_id ? String(e.session_id).slice(0, 8) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {detailOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido vinculado ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailOrders.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell>{o.product_name}</TableCell>
                      <TableCell>
                        <Badge variant={PAID.includes(String(o.status).toUpperCase()) ? "default" : "secondary"}>
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>R$ {Number(o.total_value || 0).toFixed(2)}</TableCell>
                      <TableCell>R$ {Number(o.reseller_commission || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}