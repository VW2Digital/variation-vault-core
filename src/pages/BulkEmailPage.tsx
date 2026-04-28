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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, Loader2, AlertTriangle, History, Eye, Mail, FileText, Sparkles, Wand2 } from "lucide-react";
import { BULK_EMAIL_TEMPLATES, type BulkEmailTemplate } from "@/lib/bulkEmailTemplates";

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
  }, []);

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
              <CardTitle>4. Enviar</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                size="lg"
                onClick={() => setConfirmOpen(true)}
                disabled={sending || resolved.length === 0 || !subject || !html}
              >
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Disparar para {resolved.length} destinatário(s)
              </Button>
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

      <AlertDialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Pré-visualização</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <div className="text-sm mb-2">
                  <strong>Assunto:</strong>{" "}
                  {subject.replace(/\{\{nome\}\}/gi, "João").replace(/\{\{email\}\}/gi, "joao@email.com")}
                </div>
                <div
                  className="border rounded p-4 bg-white text-foreground max-h-[400px] overflow-auto"
                  dangerouslySetInnerHTML={{
                    __html: html.replace(/\{\{nome\}\}/gi, "João").replace(/\{\{email\}\}/gi, "joao@email.com"),
                  }}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}