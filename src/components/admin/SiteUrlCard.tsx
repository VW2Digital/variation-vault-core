import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { fetchSetting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarClock,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

type SslInfo = {
  ok: boolean;
  server_name?: string;
  public_ip?: string;
  ssl_active?: boolean;
  cert_expires?: string;
  url?: string;
};

const callWebhook = async (
  action: "ssl-info" | "ssl-renew" | "ssl-status",
) => {
  const { data, error } = await supabase.functions.invoke("trigger-deploy", {
    body: { action },
  });
  if (error) throw new Error(error.message);
  return data as {
    ok: boolean;
    status: number;
    latency_ms: number;
    response: any;
  };
};

const SiteUrlCard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<SslInfo | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [lastLog, setLastLog] = useState("");
  const [configured, setConfigured] = useState(false);

  const loadInfo = async () => {
    try {
      const r = await callWebhook("ssl-info");
      if (r.ok && r.response?.ok) {
        setInfo(r.response as SslInfo);
      } else {
        setInfo({ ok: false });
      }
    } catch (e) {
      setInfo({ ok: false });
    }
  };

  useEffect(() => {
    Promise.all([
      fetchSetting("deploy_webhook_url"),
      fetchSetting("deploy_webhook_token"),
    ]).then(async ([u, t]) => {
      const ready = !!(u?.trim() && t?.trim());
      setConfigured(ready);
      if (ready) await loadInfo();
      setLoading(false);
    });
  }, []);

  const refreshSslStatus = async () => {
    try {
      const r = await callWebhook("ssl-status");
      if (r.response?.last_log) setLastLog(String(r.response.last_log));
      return r.response?.running === true;
    } catch {
      return false;
    }
  };

  const triggerRenew = async () => {
    setRenewing(true);
    setLastLog("");
    try {
      const r = await callWebhook("ssl-renew");
      if (!r.ok) {
        throw new Error(
          typeof r.response === "string"
            ? r.response
            : r.response?.error || "Falha ao iniciar emissão de SSL",
        );
      }
      toast({
        title: "Emissão de SSL iniciada",
        description: "Aguardando Let's Encrypt validar o domínio (até 90s).",
      });
      const start = Date.now();
      let running = true;
      while (running && Date.now() - start < 180_000) {
        await new Promise((res) => setTimeout(res, 4000));
        running = await refreshSslStatus();
      }
      await loadInfo();
      toast({
        title: "Processo concluído",
        description: "Veja os logs abaixo para detalhes.",
      });
    } catch (e) {
      toast({
        title: "Erro ao emitir SSL",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setRenewing(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  if (!configured) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5" /> URL da loja & SSL
          </CardTitle>
          <CardDescription>
            Configure primeiro o webhook de deploy abaixo para detectar a URL e
            gerenciar SSL daqui.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sslOk = info?.ssl_active === true;
  const url = info?.url || "";
  const expiresDate = info?.cert_expires
    ? new Date(info.cert_expires)
    : null;
  const daysToExpire = expiresDate
    ? Math.floor(
      (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    )
    : null;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5" /> URL da loja & SSL
        </CardTitle>
        <CardDescription>
          URL pública detectada na VPS e gerenciamento do certificado HTTPS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {sslOk
              ? (
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="w-3 h-3 text-primary" /> HTTPS ativo
                </Badge>
              )
              : (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="w-3 h-3" /> HTTP only
                </Badge>
              )}
            {info?.server_name && (
              <Badge variant="secondary" className="gap-1">
                <Globe className="w-3 h-3" /> {info.server_name}
              </Badge>
            )}
            {info?.public_ip && (
              <Badge variant="secondary" className="text-xs">
                IP {info.public_ip}
              </Badge>
            )}
            {expiresDate && (
              <Badge
                variant={
                  daysToExpire !== null && daysToExpire < 14
                    ? "destructive"
                    : "outline"
                }
                className="gap-1"
              >
                <CalendarClock className="w-3 h-3" />
                Expira em {daysToExpire}d
              </Badge>
            )}
          </div>

          {url
            ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-mono text-primary hover:underline break-all"
              >
                {url}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )
            : (
              <p className="text-sm text-muted-foreground">
                Nenhum domínio detectado em SERVER_NAME — instale com domínio
                via{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  install.sh
                </code>{" "}
                para habilitar SSL.
              </p>
            )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadInfo}
            disabled={renewing}
            className="gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Atualizar status
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                disabled={!info?.server_name || renewing}
                className="gap-2 ml-auto"
              >
                {renewing
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Lock className="w-4 h-4" />}
                {sslOk ? "Re-emitir SSL" : "Emitir SSL agora"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {sslOk ? "Re-emitir certificado SSL?" : "Emitir SSL?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Vai chamar Let's Encrypt para{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    {info?.server_name}
                  </code>{" "}
                  + {" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    www.{info?.server_name}
                  </code>. O container será reiniciado e o site fica fora do ar
                  por ~30 segundos.
                  <br />
                  <br />
                  <strong>Pré-requisito:</strong>{" "}
                  o DNS do domínio precisa estar apontando para esta VPS.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={triggerRenew}>
                  Sim, emitir agora
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {lastLog && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Últimas linhas da emissão:
            </p>
            <pre className="text-xs bg-muted/50 p-3 rounded-md max-h-48 overflow-auto whitespace-pre-wrap font-mono">
              {lastLog}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SiteUrlCard;