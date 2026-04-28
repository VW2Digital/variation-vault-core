import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, Loader2, AlertTriangle, History, Eye, Mail, FileText, Sparkles, Wand2, Save, Trash2, BookmarkPlus, Bookmark } from "lucide-react";
import { ShieldCheck, ShieldAlert, CheckCircle2 } from "lucide-react";
import { BULK_EMAIL_TEMPLATES, type BulkEmailTemplate } from "@/lib/bulkEmailTemplates";
import { BulkEmailSchema, analyzeBulkEmail, type ValidationIssue } from "@/lib/bulkEmailValidation";

type Audience = "all_customers" | "paid_customers" | "no_orders" | "manual";

type Recipient = { email: string; name?: string };

type Campaign = {
  id: string;
  subject: string;
  audience_type: string;
  total_recipients: number;
  total_sent: number;
  total_failed: number;
  status: string;
  created_at: string;
};

type CustomTemplate = {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  updated_at: string;
};

const AUDIENCE_LABELS: Record<Audience, string> = {
  all_customers: "Todos os clientes cadastrados",
  paid_customers: "Clientes com pedidos pagos",
  no_orders: "Clientes sem pedidos",
  manual: "Lista manual (colar e-mails)",
};

export default function BulkEmailPage() {
  const { toast } = useToast();
  const [audience, setAudience] = useState<Audience>("paid_customers");
  const [manualList, setManualList] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(
    `<p>Olá {{nome}},</p>\n<p>Escreva aqui sua mensagem.</p>\n<p>Atenciosamente,<br/>Equipe Liberty Pharma</p>`,
  );
  const [resolved, setResolved] = useState<Recipient[]>([]);
  const [resolving, setResolving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [generating, setGenerating] = useState(false);

  // Templates próprios (persistidos)
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Validações pré-envio
  const schemaResult = BulkEmailSchema.safeParse({ subject, html });
  const schemaErrors: ValidationIssue[] = schemaResult.success
    ? []
    : Object.entries(schemaResult.error.flatten().fieldErrors).flatMap(
        ([field, msgs]) =>
          (msgs || []).map((m) => ({
            level: "error" as const,
            code: `schema_${field}`,
            message: m,
          })),
      );
  const heuristicIssues = subject || html ? analyzeBulkEmail(subject, html) : [];
  const issues: ValidationIssue[] = [...schemaErrors, ...heuristicIssues];
  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;
  const htmlSizeKB = new Blob([html]).size / 1024;

  // Amostras (fallback fictício + amostra real do público carregado)
  const SAMPLE_PROFILES: Record<string, { label: string; nome: string; email: string }[]> = {
    paid_customers: [
      { label: "Cliente recorrente", nome: "Maria Silva", email: "maria.silva@gmail.com" },
      { label: "Cliente VIP", nome: "Carlos Andrade", email: "c.andrade@outlook.com" },
    ],
    all_customers: [
      { label: "Cliente cadastrado", nome: "Ana Beatriz", email: "ana.b@yahoo.com.br" },
      { label: "Novo cadastro", nome: "Pedro", email: "pedro@hotmail.com" },
    ],
    no_orders: [
      { label: "Sem compras", nome: "João Pereira", email: "joao.p@gmail.com" },
      { label: "Lead frio", nome: "Cliente", email: "lead@email.com" },
    ],
    manual: [
      { label: "Lista manual", nome: "Cliente", email: "exemplo@email.com" },
    ],
  };

  const interpolate = (text: string, nome: string, email: string) =>
    text
      .replace(/\{\{\s*nome\s*\}\}/gi, nome || "Cliente")
      .replace(/\{\{\s*email\s*\}\}/gi, email || "cliente@email.com");

  // Junta fallback + 1 amostra real (se o usuário carregou destinatários)
  const previewSamples = (() => {
    const fallback = SAMPLE_PROFILES[audience] || SAMPLE_PROFILES.all_customers;
    const realSample = resolved[0]
      ? [{
          label: "Destinatário real",
          nome: resolved[0].name?.trim() || resolved[0].email.split("@")[0],
          email: resolved[0].email,
        }]
      : [];
    return [...realSample, ...fallback];
  })();

  const handleGenerateAI = async () => {
    if (!subject.trim() && !html.trim() && !aiInstructions.trim()) {
      toast({
        title: "Forneça contexto",
        description: "Preencha o assunto, o HTML atual ou instruções para gerar um template.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-email-generate", {
        body: { subject, currentHtml: html, instructions: aiInstructions },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.html) throw new Error("Resposta vazia da IA");
      setHtml(data.html);
      toast({ title: "Nova versão gerada", description: "O HTML foi atualizado pela IA." });
    } catch (e: any) {
      toast({
        title: "Falha ao gerar template",
        description: e?.message || "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const applyTemplate = (id: string) => {
    const tpl = BULK_EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setSelectedTemplateId(id);
    if (tpl.subject) setSubject(tpl.subject);
    setHtml(tpl.html);
    toast({
      title: "Template aplicado",
      description: tpl.name,
    });
  };

  const groupedTemplates = BULK_EMAIL_TEMPLATES.reduce<Record<string, BulkEmailTemplate[]>>(
    (acc, t) => {
      (acc[t.category] = acc[t.category] || []).push(t);
      return acc;
    },
    {},
  );

  // Carrega histórico
  const loadCampaigns = async () => {
    const { data } = await supabase
      .from("bulk_email_campaigns")
      .select("id, subject, audience_type, total_recipients, total_sent, total_failed, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setCampaigns((data || []) as Campaign[]);
  };

  useEffect(() => {
    loadCampaigns();
    loadCustomTemplates();
  }, []);

  const loadCustomTemplates = async () => {
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from("bulk_email_templates")
      .select("id, name, subject, html_content, updated_at")
      .order("updated_at", { ascending: false });
    if (!error) setCustomTemplates((data || []) as CustomTemplate[]);
    setLoadingTemplates(false);
  };

  const openSaveDialog = (asNew = true) => {
    if (!subject.trim() && !html.trim()) {
      toast({ title: "Nada para salvar", description: "Preencha o assunto ou o HTML antes.", variant: "destructive" });
      return;
    }
    setEditingTemplateId(asNew ? null : editingTemplateId);
    if (asNew) setTemplateName("");
    setSaveDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      toast({ title: "Informe um nome", variant: "destructive" });
      return;
    }
    setSavingTemplate(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");

      if (editingTemplateId) {
        const { error } = await supabase
          .from("bulk_email_templates")
          .update({ name, subject, html_content: html })
          .eq("id", editingTemplateId);
        if (error) throw error;
        toast({ title: "Template atualizado", description: name });
      } else {
        const { error } = await supabase
          .from("bulk_email_templates")
          .insert({ name, subject, html_content: html, user_id: user.id });
        if (error) throw error;
        toast({ title: "Template salvo", description: name });
      }
      setSaveDialogOpen(false);
      setEditingTemplateId(null);
      setTemplateName("");
      loadCustomTemplates();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyCustomTemplate = (tpl: CustomTemplate) => {
    if (tpl.subject) setSubject(tpl.subject);
    setHtml(tpl.html_content || "");
    setEditingTemplateId(tpl.id);
    setTemplateName(tpl.name);
    toast({ title: "Template carregado", description: tpl.name });
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return;
    const { error } = await supabase
      .from("bulk_email_templates")
      .delete()
      .eq("id", deleteTemplateId);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template excluído" });
      if (editingTemplateId === deleteTemplateId) {
        setEditingTemplateId(null);
        setTemplateName("");
      }
      loadCustomTemplates();
    }
    setDeleteTemplateId(null);
  };

  // Resolve destinatários conforme audiência
  const resolveRecipients = async () => {
    setResolving(true);
    try {
      let list: Recipient[] = [];

      if (audience === "manual") {
        list = manualList
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
          .map((email) => ({ email }));
      } else if (audience === "all_customers") {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name");
        const ids = (data || []).map((p: any) => p.user_id);
        if (ids.length === 0) {
          list = [];
        } else {
          // pegar emails de auth via orders (profiles não tem email diretamente)
          const { data: orders } = await supabase
            .from("orders")
            .select("customer_email, customer_name")
            .not("customer_email", "is", null);
          const map = new Map<string, string>();
          (orders || []).forEach((o: any) => {
            const e = (o.customer_email || "").toLowerCase().trim();
            if (e) map.set(e, o.customer_name || "");
          });
          list = Array.from(map.entries()).map(([email, name]) => ({ email, name }));
        }
      } else if (audience === "paid_customers") {
        const { data } = await supabase
          .from("orders")
          .select("customer_email, customer_name, status")
          .in("status", ["PAID", "CONFIRMED", "RECEIVED", "paid", "confirmed", "received"]);
        const map = new Map<string, string>();
        (data || []).forEach((o: any) => {
          const e = (o.customer_email || "").toLowerCase().trim();
          if (e) map.set(e, o.customer_name || "");
        });
        list = Array.from(map.entries()).map(([email, name]) => ({ email, name }));
      } else if (audience === "no_orders") {
        // emails que aparecem em orders excluídos do total cadastrado é difícil
        // sem auth.users; aproximação: pegar emails únicos das orders e
        // marcar os que NÃO têm nenhum pedido pago. Aqui retornamos
        // emails que existem em orders mas SEM nenhum pago.
        const { data } = await supabase
          .from("orders")
          .select("customer_email, customer_name, status");
        const allMap = new Map<string, { name: string; paid: boolean }>();
        (data || []).forEach((o: any) => {
          const e = (o.customer_email || "").toLowerCase().trim();
          if (!e) return;
          const isPaid = ["PAID", "CONFIRMED", "RECEIVED", "paid", "confirmed", "received"].includes(o.status);
          const cur = allMap.get(e);
          allMap.set(e, {
            name: cur?.name || o.customer_name || "",
            paid: (cur?.paid ?? false) || isPaid,
          });
        });
        list = Array.from(allMap.entries())
          .filter(([, v]) => !v.paid)
          .map(([email, v]) => ({ email, name: v.name }));
      }

      // Dedup
      const seen = new Set<string>();
      const dedup = list.filter((r) => {
        const k = r.email.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      setResolved(dedup);
      toast({
        title: "Destinatários carregados",
        description: `${dedup.length} e-mails únicos encontrados.`,
      });
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e?.message || "Falha ao buscar destinatários",
        variant: "destructive",
      });
    } finally {
      setResolving(false);
    }
  };

  const handleSend = async () => {
    setConfirmOpen(false);
    if (!subject.trim() || !html.trim()) {
      toast({ title: "Preencha assunto e mensagem", variant: "destructive" });
      return;
    }
    if (errorCount > 0) {
      toast({
        title: "Corrija os erros antes de enviar",
        description: `${errorCount} erro(s) bloqueando o envio.`,
        variant: "destructive",
      });
      return;
    }
    if (resolved.length === 0) {
      toast({ title: "Nenhum destinatário carregado", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-email-send", {
        body: {
          subject,
          html,
          recipients: resolved,
          audience_type: audience,
          batch_size: 10,
          delay_ms: 500,
        },
      });
      if (error) throw error;
      toast({
        title: "Envio concluído",
        description: `Enviados: ${data.sent} • Falhas: ${data.failed}`,
      });
      loadCampaigns();
    } catch (e: any) {
      toast({
        title: "Falha no envio",
        description: e?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Send className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Disparo de E-mails</h1>
          <p className="text-sm text-muted-foreground">
            Envio manual em massa para clientes selecionados.
          </p>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Use com responsabilidade</AlertTitle>
        <AlertDescription>
          Envios em massa sem opt-in podem prejudicar a reputação do seu domínio
          e gerar bloqueios pelos provedores. Envie apenas para clientes que
          consentiram receber comunicações.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">
            <Mail className="w-4 h-4 mr-2" /> Compor
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> 1. Selecionar destinatários
              </CardTitle>
              <CardDescription>
                Escolha o público-alvo e clique em "Carregar destinatários".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Público-alvo</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUDIENCE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {audience === "manual" && (
                <div>
                  <Label>Cole os e-mails (um por linha, ou separados por vírgula)</Label>
                  <Textarea
                    value={manualList}
                    onChange={(e) => setManualList(e.target.value)}
                    rows={6}
                    placeholder={"cliente1@email.com\ncliente2@email.com"}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={resolveRecipients} disabled={resolving} variant="secondary">
                  {resolving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                  Carregar destinatários
                </Button>
                {resolved.length > 0 && (
                  <Badge variant="outline" className="text-base">
                    {resolved.length} destinatários únicos
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" /> 2. Escolher template (opcional)
              </CardTitle>
              <CardDescription>
                Selecione um modelo pronto. Você pode editar o conteúdo depois.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Template</Label>
                <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template pronto..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {Object.entries(groupedTemplates).map(([cat, items]) => (
                      <div key={cat}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {cat}
                        </div>
                        {items.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{t.name}</span>
                              <span className="text-xs text-muted-foreground">{t.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {BULK_EMAIL_TEMPLATES.slice(0, 8).map((t) => (
                  <Button
                    key={t.id}
                    variant={selectedTemplateId === t.id ? "default" : "outline"}
                    size="sm"
                    className="h-auto py-2 px-3 justify-start text-left"
                    onClick={() => applyTemplate(t.id)}
                  >
                    <FileText className="w-3.5 h-3.5 mr-2 shrink-0" />
                    <span className="truncate text-xs">{t.name}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bookmark className="w-5 h-5" /> Meus templates salvos
                  </CardTitle>
                  <CardDescription>
                    Salve a mensagem atual para reutilizar em campanhas futuras.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {editingTemplateId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveTemplate}
                      disabled={savingTemplate}
                    >
                      {savingTemplate ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Atualizar "{templateName}"
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openSaveDialog(true)}>
                    <BookmarkPlus className="w-4 h-4 mr-2" />
                    Salvar como novo
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                </div>
              ) : customTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum template salvo ainda. Crie sua mensagem acima e clique em "Salvar como novo".
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className={`border rounded-lg p-3 flex flex-col gap-2 ${
                        editingTemplateId === tpl.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{tpl.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {tpl.subject || "(sem assunto)"}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            Atualizado em {new Date(tpl.updated_at).toLocaleString("pt-BR")}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          onClick={() => applyCustomTemplate(tpl)}
                        >
                          Carregar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTemplateId(tpl.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Mensagem</CardTitle>
              <CardDescription>
                Variáveis disponíveis:{" "}
                <code className="text-xs bg-muted px-1 rounded">{"{{nome}}"}</code>{" "}
                <code className="text-xs bg-muted px-1 rounded">{"{{email}}"}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="subject">Assunto</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Novidades da Liberty Pharma"
                />
              </div>
              <div>
                <Label htmlFor="html">Conteúdo (HTML)</Label>
                <Textarea
                  id="html"
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="w-4 h-4 mr-2" /> Pré-visualizar
                </Button>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold">Gerar nova versão com IA</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  A IA usará o assunto, o HTML atual e as instruções abaixo para criar uma nova versão
                  preservando as variáveis <code className="bg-muted px-1 rounded">{"{{nome}}"}</code> e{" "}
                  <code className="bg-muted px-1 rounded">{"{{email}}"}</code>.
                </p>
                <Textarea
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  rows={2}
                  placeholder="Instruções opcionais (ex: tom mais informal, adicionar CTA para WhatsApp, destacar frete grátis...)"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerateAI}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  {generating ? "Gerando..." : "Gerar nova versão"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {errorCount > 0 ? (
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                ) : warningCount > 0 ? (
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                )}
                4. Validação e envio
              </CardTitle>
              <CardDescription>
                Verificações automáticas antes do disparo para reduzir falhas de entrega.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Resumo de validação */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">Tamanho HTML</div>
                  <div className={`text-lg font-bold ${htmlSizeKB > 100 ? "text-destructive" : htmlSizeKB > 80 ? "text-amber-600" : "text-foreground"}`}>
                    {htmlSizeKB.toFixed(1)} KB
                  </div>
                  <div className="text-[10px] text-muted-foreground">limite Gmail: 102KB</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">Erros</div>
                  <div className={`text-lg font-bold ${errorCount > 0 ? "text-destructive" : "text-green-600"}`}>
                    {errorCount}
                  </div>
                  <div className="text-[10px] text-muted-foreground">bloqueiam o envio</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">Avisos</div>
                  <div className={`text-lg font-bold ${warningCount > 0 ? "text-amber-600" : "text-green-600"}`}>
                    {warningCount}
                  </div>
                  <div className="text-[10px] text-muted-foreground">recomendações</div>
                </div>
              </div>

              {/* Lista de avisos */}
              {issues.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-auto pr-1">
                  {issues.map((it, idx) => (
                    <Alert
                      key={`${it.code}-${idx}`}
                      variant={it.level === "error" ? "destructive" : "default"}
                      className={it.level === "warning" ? "border-amber-500/50 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600" : ""}
                    >
                      {it.level === "error" ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                      <AlertDescription className="text-xs">
                        {it.message}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              ) : subject && html ? (
                <Alert className="border-green-500/50 text-green-900 dark:text-green-200 [&>svg]:text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle className="text-sm">Tudo certo!</AlertTitle>
                  <AlertDescription className="text-xs">
                    Nenhum problema detectado. Pronto para envio.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                size="lg"
                onClick={() => setConfirmOpen(true)}
                disabled={sending || resolved.length === 0 || !subject || !html || errorCount > 0}
              >
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Disparar para {resolved.length} destinatário(s)
              </Button>
              {errorCount > 0 && (
                <p className="text-xs text-destructive">
                  Envio bloqueado até corrigir {errorCount} erro(s) acima.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Campanhas anteriores</CardTitle>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma campanha enviada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {campaigns.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.subject}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleString("pt-BR")} •{" "}
                          {AUDIENCE_LABELS[c.audience_type as Audience] || c.audience_type}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{c.total_sent}/{c.total_recipients} enviados</Badge>
                        {c.total_failed > 0 && (
                          <Badge variant="destructive">{c.total_failed} falhas</Badge>
                        )}
                        <Badge variant={c.status === "completed" ? "default" : "secondary"}>
                          {c.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar disparo?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a enviar <strong>{resolved.length} e-mails</strong> com
              o assunto "<strong>{subject}</strong>". Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Confirmar envio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Pré-visualização do e-mail
            </DialogTitle>
            <DialogDescription>
              Veja como o e-mail aparece para diferentes destinatários, com as
              variáveis <code className="bg-muted px-1 rounded">{"{{nome}}"}</code> e{" "}
              <code className="bg-muted px-1 rounded">{"{{email}}"}</code> substituídas.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="0" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="flex-wrap h-auto justify-start">
              {previewSamples.map((s, i) => (
                <TabsTrigger key={i} value={String(i)} className="text-xs">
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {previewSamples.map((s, i) => (
              <TabsContent
                key={i}
                value={String(i)}
                className="flex-1 overflow-auto mt-3 space-y-3"
              >
                <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Para:</span>
                    <span className="font-mono">
                      {s.nome ? `${s.nome} <${s.email}>` : s.email}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Assunto:</span>
                    <span className="font-medium text-right truncate">
                      {interpolate(subject || "(sem assunto)", s.nome, s.email)}
                    </span>
                  </div>
                </div>

                <div
                  className="border rounded-lg p-4 bg-white text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: interpolate(html, s.nome, s.email),
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5" /> Salvar template
            </DialogTitle>
            <DialogDescription>
              Dê um nome para identificar este template na sua biblioteca.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="tpl-name">Nome do template</Label>
              <Input
                id="tpl-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ex: Promo Black Friday 2026"
                autoFocus
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Assunto: <strong>{subject || "(vazio)"}</strong> • {(new Blob([html]).size / 1024).toFixed(1)} KB
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveTemplate} disabled={savingTemplate}>
              {savingTemplate ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTemplateId} onOpenChange={(o) => !o && setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}