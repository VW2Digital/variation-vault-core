import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fetchSetting, upsertSetting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, Send, RotateCcw, Eye, Code2, Mail } from "lucide-react";

type TemplateKey =
  | "order_created"
  | "order_paid"
  | "shipping_update"
  | "payment_failure"
  | "cart_abandonment"
  | "admin_notification"
  | "custom";

interface TemplateMeta {
  key: TemplateKey;
  label: string;
  description: string;
  defaultSubject: string;
  defaultHtml: string;
  sampleData: Record<string, any>;
  variables: string[];
}

const TEMPLATES: TemplateMeta[] = [
  {
    key: "order_created",
    label: "Pedido recebido",
    description: "Disparado quando um pedido é criado, antes da confirmação de pagamento.",
    defaultSubject: "Pedido recebido — {{product_name}}",
    defaultHtml: `<p>Olá <strong>{{customer_name}}</strong>,</p>
<p>Recebemos seu pedido <strong>#{{order_id}}</strong> e ele já está na fila.</p>
<p><strong>Produto:</strong> {{product_name}}<br/>
<strong>Valor:</strong> R$ {{total_value}}<br/>
<strong>Pagamento:</strong> {{payment_method}}</p>
<p><a href="{{store_url}}/minha-conta">Ver meu pedido</a></p>`,
    sampleData: {
      customer_name: "Maria Silva",
      order_id: "1234",
      product_name: "Produto Exemplo",
      total_value: "150,00",
      payment_method: "PIX",
    },
    variables: ["customer_name", "order_id", "product_name", "total_value", "payment_method", "store_name", "store_url"],
  },
  {
    key: "order_paid",
    label: "Pagamento confirmado",
    description: "Enviado ao cliente quando o pagamento é aprovado.",
    defaultSubject: "Pagamento confirmado — pedido #{{order_id}}",
    defaultHtml: `<p>Olá <strong>{{customer_name}}</strong>,</p>
<p>Seu pagamento foi <strong>confirmado</strong>! Já estamos preparando o envio.</p>
<p><strong>Pedido:</strong> #{{order_id}}<br/>
<strong>Total:</strong> R$ {{total_value}}</p>`,
    sampleData: { customer_name: "Maria Silva", order_id: "1234", total_value: "150,00" },
    variables: ["customer_name", "order_id", "total_value", "store_name", "store_url"],
  },
  {
    key: "shipping_update",
    label: "Atualização de envio",
    description: "Notifica o cliente sobre mudanças no status logístico.",
    defaultSubject: "Atualização do envio — {{tracking_code}}",
    defaultHtml: `<p>Olá <strong>{{customer_name}}</strong>,</p>
<p>Status atual: <strong>{{status}}</strong></p>
<p><strong>Código de rastreio:</strong> {{tracking_code}}</p>
<p><a href="{{tracking_url}}">Rastrear envio</a></p>`,
    sampleData: {
      customer_name: "Maria Silva",
      status: "Postado",
      tracking_code: "BR123456789",
      tracking_url: "https://rastreio.exemplo/BR123456789",
    },
    variables: ["customer_name", "status", "tracking_code", "tracking_url", "store_name", "store_url"],
  },
  {
    key: "payment_failure",
    label: "Falha no pagamento",
    description: "Avisa o cliente quando o pagamento é recusado.",
    defaultSubject: "Falha no pagamento — pedido #{{order_id}}",
    defaultHtml: `<p>Olá <strong>{{customer_name}}</strong>,</p>
<p>Tivemos um problema processando seu pagamento.</p>
<p><strong>Motivo:</strong> {{error_message}}</p>
<p><a href="{{store_url}}/minha-conta">Tentar novamente</a></p>`,
    sampleData: { customer_name: "Maria Silva", order_id: "1234", error_message: "Cartão recusado pela operadora" },
    variables: ["customer_name", "order_id", "error_message", "store_name", "store_url"],
  },
  {
    key: "cart_abandonment",
    label: "Carrinho abandonado",
    description: "Lembrete enviado a clientes que deixaram itens no carrinho.",
    defaultSubject: "{{customer_name}}, seus itens estão esperando!",
    defaultHtml: `<p>Olá <strong>{{customer_name}}</strong>,</p>
<p>Você deixou alguns itens no carrinho. Garanta antes que esgote!</p>
<p>Total: R$ {{total_value}}</p>
<p><a href="{{store_url}}/carrinho">Finalizar minha compra</a></p>`,
    sampleData: { customer_name: "Maria Silva", total_value: "299,90" },
    variables: ["customer_name", "total_value", "items", "store_name", "store_url"],
  },
  {
    key: "admin_notification",
    label: "Notificação interna (admin)",
    description: "Mensagens internas para a equipe administrativa.",
    defaultSubject: "Notificação interna — {{store_name}}",
    defaultHtml: `<p><strong>Evento:</strong> {{event}}</p>
<p>{{message}}</p>`,
    sampleData: { event: "Novo pedido", message: "Pedido #1234 criado por Maria Silva." },
    variables: ["event", "message", "details", "store_name"],
  },
  {
    key: "custom",
    label: "Mensagem personalizada",
    description: "Template de uso geral. Aceita qualquer variável passada no campo data ao chamar a função.",
    defaultSubject: "Mensagem de {{store_name}}",
    defaultHtml: `<p>Olá <strong>{{customer_name}}</strong>,</p>
<p>Escreva aqui sua mensagem personalizada.</p>`,
    sampleData: { customer_name: "Maria Silva" },
    variables: ["customer_name", "store_name", "store_url"],
  },
];

function interpolate(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) =>
    vars[key] !== undefined ? vars[key] : "",
  );
}

const EmailTemplatesPage = () => {
  const { toast } = useToast();
  const [active, setActive] = useState<TemplateKey>("order_created");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [storeName, setStoreName] = useState("Liberty Pharma");
  const [storeUrl, setStoreUrl] = useState("");

  // For each template: { subject, html } — empty string means "use default".
  const [drafts, setDrafts] = useState<Record<TemplateKey, { subject: string; html: string }>>(
    () =>
      TEMPLATES.reduce(
        (acc, t) => ({ ...acc, [t.key]: { subject: "", html: "" } }),
        {} as Record<TemplateKey, { subject: string; html: string }>,
      ),
  );

  const [testTo, setTestTo] = useState("");

  const meta = useMemo(() => TEMPLATES.find((t) => t.key === active)!, [active]);
  const draft = drafts[active];

  const effectiveSubject = draft.subject || meta.defaultSubject;
  const effectiveHtml = draft.html || meta.defaultHtml;

  const previewVars = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {
      store_name: storeName || "Liberty Pharma",
      store_url: storeUrl || "",
      customer_name: meta.sampleData.customer_name || "Cliente",
    };
    for (const [k, v] of Object.entries(meta.sampleData)) {
      base[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    return base;
  }, [meta, storeName, storeUrl]);

  useEffect(() => {
    (async () => {
      try {
        const [sn, su, ...vals] = await Promise.all([
          fetchSetting("store_name"),
          fetchSetting("store_public_url"),
          ...TEMPLATES.flatMap((t) => [
            fetchSetting(`email_template_${t.key}_subject`),
            fetchSetting(`email_template_${t.key}_html`),
          ]),
        ]);
        if (sn) setStoreName(sn);
        if (su) setStoreUrl(su);
        const next: Record<TemplateKey, { subject: string; html: string }> = { ...drafts };
        TEMPLATES.forEach((t, i) => {
          next[t.key] = {
            subject: vals[i * 2] || "",
            html: vals[i * 2 + 1] || "",
          };
        });
        setDrafts(next);
      } catch (err) {
        console.error("load templates", err);
        toast({ title: "Erro ao carregar templates", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateDraft = (field: "subject" | "html", value: string) => {
    setDrafts((d) => ({ ...d, [active]: { ...d[active], [field]: value } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsertSetting(`email_template_${active}_subject`, draft.subject),
        upsertSetting(`email_template_${active}_html`, draft.html),
      ]);
      toast({ title: "Template salvo", description: "As alterações já valem para os próximos envios." });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Restaurar este template para o padrão? Os textos personalizados serão apagados.")) return;
    setSaving(true);
    try {
      await Promise.all([
        upsertSetting(`email_template_${active}_subject`, ""),
        upsertSetting(`email_template_${active}_html`, ""),
      ]);
      setDrafts((d) => ({ ...d, [active]: { subject: "", html: "" } }));
      toast({ title: "Template restaurado", description: "Voltamos ao layout padrão." });
    } catch (err: any) {
      toast({ title: "Erro ao restaurar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testTo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
      toast({ title: "Email inválido", description: "Informe um destinatário válido.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        template: active,
        to: testTo,
        data: meta.sampleData,
      };
      if (active === "custom") {
        payload.subject = interpolate(effectiveSubject, previewVars);
        payload.html = interpolate(effectiveHtml, previewVars);
      }
      const { data, error } = await supabase.functions.invoke("send-email", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: "Email de teste enviado",
        description: `Verifique a caixa de entrada de ${testTo}.`,
      });
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message || String(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const previewSubject = interpolate(effectiveSubject, previewVars);
  const previewHtml = interpolate(effectiveHtml, previewVars);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/admin/configuracoes/comunicacao')}
          className="shrink-0 mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Mail className="w-6 h-6 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Templates de Email</h1>
          <p className="text-sm text-muted-foreground">
            Personalize o assunto e o HTML enviados pela função send-email. Deixe em branco para usar o padrão.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Selecione o template</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={active} onValueChange={(v) => setActive(v as TemplateKey)}>
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">{meta.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {meta.variables.map((v) => (
              <code
                key={v}
                className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border"
              >{`{{${v}}}`}</code>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="w-4 h-4" />
              Editor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Assunto</Label>
              <Input
                id="tpl-subject"
                value={draft.subject}
                placeholder={meta.defaultSubject}
                onChange={(e) => updateDraft("subject", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-html">HTML</Label>
              <Textarea
                id="tpl-html"
                value={draft.html}
                placeholder={meta.defaultHtml}
                onChange={(e) => updateDraft("html", e.target.value)}
                className="font-mono text-xs min-h-[320px]"
              />
              <p className="text-xs text-muted-foreground">
                Use chaves duplas para variáveis, ex: <code>{"{{customer_name}}"}</code>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Restaurar padrão
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Pré-visualização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="render">
              <TabsList>
                <TabsTrigger value="render">Renderizado</TabsTrigger>
                <TabsTrigger value="source">Código</TabsTrigger>
              </TabsList>
              <TabsContent value="render" className="mt-3 space-y-3">
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Assunto: </span>
                  <span className="font-medium">{previewSubject}</span>
                </div>
                <iframe
                  title="preview"
                  className="w-full min-h-[320px] rounded-md border bg-background"
                  srcDoc={`<!doctype html><html><body style="margin:0;font-family:Arial,sans-serif;background:#fff;color:#1a1a2e;padding:16px;">${previewHtml}</body></html>`}
                />
              </TabsContent>
              <TabsContent value="source" className="mt-3">
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[360px] whitespace-pre-wrap">
                  {previewHtml}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" />
            Enviar email de teste
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Envia este template com dados de exemplo para o destinatário informado, usando a função
            <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">send-email</code>.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
            <Input
              type="email"
              placeholder="destinatario@exemplo.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button onClick={handleSendTest} disabled={sending}>
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar teste
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailTemplatesPage;