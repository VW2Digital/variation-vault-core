import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { fetchSetting, upsertSetting } from "@/lib/api";
import {
  Loader2,
  Save,
  Mail,
  CheckCircle2,
  XCircle,
  Truck,
  PackageCheck,
  ShoppingBag,
  Inbox,
  ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type EventKey =
  | "order_created"
  | "order_paid"
  | "payment_failure"
  | "shipping_update"
  | "cart_abandonment";

interface EventDef {
  key: EventKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  trigger: string;
}

const EVENTS: EventDef[] = [
  {
    key: "order_paid",
    title: "Pagamento confirmado",
    description: "Cliente recebe o recibo assim que o gateway aprova o PIX ou cartão.",
    icon: CheckCircle2,
    trigger: "Webhook do gateway (Asaas / Mercado Pago / Pagar.me / PagBank)",
  },
  {
    key: "payment_failure",
    title: "Pagamento recusado",
    description: "Cliente é avisado quando o cartão é negado ou o PIX expira.",
    icon: XCircle,
    trigger: "Webhook do gateway",
  },
  {
    key: "shipping_update",
    title: "Atualização de rastreio",
    description:
      "Notifica o cliente quando o pedido é postado, está em trânsito ou foi entregue.",
    icon: Truck,
    trigger: "Webhook Melhor Envio + atualização manual no painel",
  },
  {
    key: "order_created",
    title: "Pedido criado",
    description: "E-mail opcional logo após o cliente finalizar o checkout, antes da confirmação do pagamento.",
    icon: ShoppingBag,
    trigger: "Disparo manual / código no checkout",
  },
  {
    key: "cart_abandonment",
    title: "Carrinho abandonado",
    description: "Lembrete automático para clientes que deixaram itens no carrinho.",
    icon: Inbox,
    trigger: "Cron diário (cart-abandonment)",
  },
];

const flagKey = (k: EventKey) => `email_event_${k}_enabled`;

const EmailEventsPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flags, setFlags] = useState<Record<EventKey, boolean>>({
    order_created: true,
    order_paid: true,
    payment_failure: true,
    shipping_update: true,
    cart_abandonment: true,
  });
  const [adminCopy, setAdminCopy] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const keys = EVENTS.map((e) => flagKey(e.key));
        const values = await Promise.all([
          ...keys.map((k) => fetchSetting(k)),
          fetchSetting("email_admin_copy_enabled"),
          fetchSetting("admin_notification_email"),
        ]);
        const next = { ...flags };
        EVENTS.forEach((e, i) => {
          const v = (values[i] || "").toLowerCase();
          // default = enabled (anything other than explicit false)
          next[e.key] = !(v === "false" || v === "0" || v === "off");
        });
        setFlags(next);
        const adminCopyVal = (values[keys.length] || "").toLowerCase();
        setAdminCopy(adminCopyVal === "true" || adminCopyVal === "1" || adminCopyVal === "on");
        setAdminEmail(values[keys.length + 1] || "");
      } catch (err: any) {
        toast({
          title: "Erro ao carregar eventos",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        ...EVENTS.map((e) => upsertSetting(flagKey(e.key), flags[e.key] ? "true" : "false")),
        upsertSetting("email_admin_copy_enabled", adminCopy ? "true" : "false"),
        upsertSetting("admin_notification_email", adminEmail.trim()),
      ]);
      toast({
        title: "Eventos atualizados",
        description: "As mudanças já valem para os próximos disparos.",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/admin/configuracoes/comunicacao')}
          className="shrink-0 mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PackageCheck className="w-6 h-6 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Eventos de E-mail</h1>
          <p className="text-sm text-muted-foreground">
            Marque quais notificações devem ser enviadas automaticamente via SMTP.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Disparo automático por evento
          </CardTitle>
          <CardDescription>
            Cada switch controla se o e-mail correspondente é enviado quando o evento acontece.
            Os textos podem ser personalizados em <strong>Templates de Email</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {EVENTS.map((event, idx) => {
            const Icon = event.icon;
            return (
              <div key={event.key}>
                {idx > 0 && <Separator />}
                <div className="flex items-start gap-4 py-4">
                  <div className="mt-0.5 rounded-md bg-muted p-2">
                    <Icon className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <Label
                        htmlFor={`flag-${event.key}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {event.title}
                      </Label>
                      <Switch
                        id={`flag-${event.key}`}
                        checked={flags[event.key]}
                        onCheckedChange={(v) => setFlags((f) => ({ ...f, [event.key]: v }))}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-1">
                      Fonte: {event.trigger}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cópia para o admin</CardTitle>
          <CardDescription>
            Envia uma cópia de cada e-mail (exceto notificações internas) para o endereço abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="admin-copy" className="cursor-pointer">
              Receber cópia em todos os eventos
            </Label>
            <Switch id="admin-copy" checked={adminCopy} onCheckedChange={setAdminCopy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">E-mail do admin</Label>
            <Input
              id="admin-email"
              type="email"
              placeholder="admin@suaempresa.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Deve ser um endereço válido. Se a cópia estiver desligada, ele continua sendo usado
              para alertas críticos (falhas de pagamento).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
};

export default EmailEventsPage;
