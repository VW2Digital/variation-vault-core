import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fetchSetting, upsertSetting, getCurrentUser } from "@/lib/api";
import { Database, AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";

/**
 * Permite sobrescrever em runtime a URL do Supabase usada para montar
 * URLs de webhook (ex.: cards na tela de Pagamentos).
 *
 * Útil quando o build em produção foi gerado com VITE_SUPABASE_URL incorreto
 * (ex.: VPS construiu o bundle com .env de exemplo apontando para outro projeto).
 * Salvo em site_settings.supabase_url_override.
 */
const SupabaseUrlOverrideCard = () => {
  const { toast } = useToast();
  const buildUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  const [override, setOverride] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSetting("supabase_url_override").then((v) => {
      setOverride(v || "");
      setLoading(false);
    });
  }, []);

  const effective = override?.trim() || buildUrl;
  const mismatch = !!override?.trim() && override.trim() !== buildUrl;
  const validUrl = !override?.trim() || /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(override.trim());

  const save = async () => {
    if (!validUrl) {
      toast({
        title: "URL inválida",
        description: "Use o formato https://<ref>.supabase.co",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Não autenticado");
      await upsertSetting("supabase_url_override", override.trim().replace(/\/+$/, ""), user.id);
      toast({ title: "URL do backend atualizada", description: "Recarregue a página para aplicar nos cards de webhook." });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Não autenticado");
      await upsertSetting("supabase_url_override", "", user.id);
      setOverride("");
      toast({ title: "Override removido", description: "Voltando a usar a URL do build." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="w-5 h-5" /> URL do Backend (override)
        </CardTitle>
        <CardDescription>
          Use este campo se o build em produção foi gerado com a URL errada (ex.: o card de webhook mostra um projeto antigo).
          A URL salva aqui é lida em runtime e sobrescreve a do build, sem precisar recompilar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">URL do build:</span>
            <code className="font-mono break-all">{buildUrl || "(vazio)"}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">URL efetiva:</span>
            <code className="font-mono break-all">{effective || "(vazio)"}</code>
            {mismatch && (
              <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3" /> sobrescrita
              </Badge>
            )}
            {!mismatch && override?.trim() && (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="w-3 h-3 text-primary" /> igual ao build
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>URL do Supabase (deixe em branco para usar a do build)</Label>
          <Input
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder="https://vkomfiplmhpkhfpidrng.supabase.co"
            className="font-mono text-xs"
          />
          {!validUrl && (
            <p className="text-xs text-destructive">Formato esperado: https://&lt;ref&gt;.supabase.co</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !validUrl} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Salvar
          </Button>
          {override?.trim() && (
            <Button variant="outline" onClick={clear} disabled={saving} className="gap-2">
              <RotateCcw className="w-4 h-4" /> Voltar para a URL do build
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SupabaseUrlOverrideCard;