import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Zap, Save } from "lucide-react";
import SettingsBackButton from "./SettingsBackButton";
import { fetchSetting, upsertSetting } from "@/lib/api";

interface WidgetConfig {
  enabled: boolean;
  expires_at: string;
  title: string;
}

const defaultConfig: WidgetConfig = {
  enabled: false,
  expires_at: "",
  title: "Ofertas Relâmpago",
};

const toLocalInput = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
};

const SettingsFlashOffersWidget = () => {
  const [config, setConfig] = useState<WidgetConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await fetchSetting("flash_offers_widget");
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          setConfig({ ...defaultConfig, ...parsed });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await upsertSetting("flash_offers_widget", JSON.stringify(config));
      toast.success("Widget salvo com sucesso");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-2xl">
      <SettingsBackButton
        title="Widget Ofertas Relâmpago"
        description="Card flutuante exibido no catálogo com produtos em oferta"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Configuração
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-base">Ativar widget</Label>
              <p className="text-sm text-muted-foreground">
                Exibe o card flutuante na home/catálogo
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => setConfig({ ...config, enabled: v })}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={config.title}
              onChange={(e) => setConfig({ ...config, title: e.target.value })}
              placeholder="Ofertas Relâmpago"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Encerra em</Label>
            <Input
              type="datetime-local"
              value={toLocalInput(config.expires_at)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  expires_at: e.target.value ? new Date(e.target.value).toISOString() : "",
                })
              }
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Quando o contador chegar a zero, o widget some automaticamente.
            </p>
          </div>

          <div className="rounded-lg bg-muted/40 border p-3 text-sm text-muted-foreground">
            Os produtos exibidos são automaticamente os que possuem{" "}
            <span className="font-medium text-foreground">preço promocional</span> ativo
            (campo "oferta" nas variações). Até 3 itens.
          </div>

          <Button onClick={save} disabled={saving || loading} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsFlashOffersWidget;