import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { fetchSetting, getCurrentUser, upsertSetting } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCcw,
  Rocket,
  XCircle,
} from "lucide-react";

type Health = { ok: boolean; version?: string; branch?: string } | null;

const DeployUpdateCard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [checking, setChecking] = useState(false);

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [health, setHealth] = useState<Health>(null);
  const [lastLog, setLastLog] = useState<string>("");

  useEffect(() => {
    Promise.all([
      fetchSetting("deploy_webhook_url"),
      fetchSetting("deploy_webhook_token"),
    ])
      .then(([u, t]) => {
        setUrl(u || "");
        setToken(t || "");
      })
      .finally(() => setLoading(false));
  }, []);

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Não autenticado");
      await Promise.all([
        upsertSetting("deploy_webhook_url", url.trim(), user.id),
        upsertSetting("deploy_webhook_token", token.trim(), user.id),
      ]);
      toast({ title: "Configuração salva" });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSavingCfg(false);
    }
  };

  const callWebhook = async (action: "health" | "deploy" | "status") => {
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

  const checkHealth = async () => {
    setChecking(true);
    setHealth(null);
    try {
      const r = await callWebhook("health");
      if (r.ok && r.response?.ok) {
        setHealth({
          ok: true,
          version: r.response.version,
          branch: r.response.branch,
        });
        toast({
          title: "VPS conectada",
          description: `Versão atual: ${r.response.version} (${r.response.branch})`,
        });
      } else {
        setHealth({ ok: false });
        toast({
          title: "Falha no health-check",
          description: JSON.stringify(r.response),
          variant: "destructive",
        });
      }
    } catch (e) {
      setHealth({ ok: false });
      toast({
        title: "Erro de conexão",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  };

  const refreshStatus = async () => {
    try {
      const r = await callWebhook("status");
      if (r.response?.last_log) setLastLog(String(r.response.last_log));
      return r.response?.running === true;
    } catch {
      return false;
    }
  };

  const triggerDeploy = async () => {
    setDeploying(true);
    setLastLog("");
    try {
      const r = await callWebhook("deploy");
      if (!r.ok) {
        throw new Error(
          typeof r.response === "string"
            ? r.response
            : r.response?.error || "Falha ao iniciar deploy",
        );
      }
      toast({
        title: "Atualização iniciada",
        description: "A VPS está puxando o código e reconstruindo o container.",
      });
      // Polling status até terminar (máx 3 min)
      const start = Date.now();
      let running = true;
      while (running && Date.now() - start < 180_000) {
        await new Promise((r) => setTimeout(r, 4000));
        running = await refreshStatus();
      }
      if (!running) {
        await checkHealth();
        toast({ title: "Deploy concluído", description: "Aplicação atualizada." });
      } else {
        toast({
          title: "Deploy em andamento",
          description: "Demorando mais que o esperado — verifique os logs na VPS.",
        });
      }
    } catch (e) {
      toast({
        title: "Erro ao atualizar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setDeploying(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  const isConfigured = url.trim() && token.trim();

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          Atualizar aplicação (puxar do Git)
        </CardTitle>
        <CardDescription>
          Dispara{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">git pull</code>
          {" "}+ rebuild do container na VPS, sem precisar abrir SSH.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>URL do webhook</Label>
            <Input
              placeholder="https://seudominio.com/deploy-api"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Token (X-Deploy-Token)</Label>
            <Input
              type="password"
              placeholder="cole o token gerado pelo install-deploy-webhook.sh"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={saveConfig}
            disabled={savingCfg}
            size="sm"
          >
            {savingCfg ? "Salvando..." : "Salvar configuração"}
          </Button>
          <Button
            variant="outline"
            onClick={checkHealth}
            disabled={!isConfigured || checking || deploying}
            size="sm"
            className="gap-2"
          >
            {checking
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Activity className="w-4 h-4" />}
            Verificar conexão
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={!isConfigured || deploying || checking}
                size="sm"
                className="gap-2 ml-auto"
              >
                {deploying
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCcw className="w-4 h-4" />}
                {deploying ? "Atualizando..." : "Atualizar agora"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Atualizar aplicação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vai executar{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    git pull
                  </code>{" "}
                  +{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">
                    docker compose build
                  </code>{" "}
                  na VPS. Pode levar 30–90 segundos. Durante o rebuild, o site
                  pode ficar indisponível por alguns segundos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={triggerDeploy}>
                  Sim, atualizar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {health && (
          <div className="flex items-center gap-2 text-sm">
            {health.ok
              ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="w-3 h-3 text-primary" />
                  Online
                </Badge>
              )
              : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" /> Offline
                </Badge>
              )}
            {health.version && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <GitBranch className="w-3 h-3" />
                {health.branch} @ {health.version}
              </span>
            )}
          </div>
        )}

        {lastLog && (
          <div className="space-y-1">
            <Label className="text-xs">Últimas linhas do deploy</Label>
            <pre className="text-xs bg-muted/50 p-3 rounded-md max-h-48 overflow-auto whitespace-pre-wrap font-mono">
              {lastLog}
            </pre>
          </div>
        )}

        {!isConfigured && (
          <p className="text-xs text-muted-foreground border-l-2 border-amber-500 pl-3">
            Para habilitar, rode na VPS:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">
              sudo bash deploy-vps/install-deploy-webhook.sh
            </code>
            , copie o token mostrado no final e cole acima junto com{" "}
            <code className="bg-muted px-1 py-0.5 rounded">
              https://seudominio/deploy-api
            </code>.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default DeployUpdateCard;