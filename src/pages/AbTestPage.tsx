import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Eye, MousePointerClick, TrendingUp, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
} from '@/components/ui/alert-dialog';

type Row = {
  variant: 'A' | 'B';
  event_type: 'impression' | 'cta_click';
  session_id: string;
};

type Stats = {
  impressions: number;
  uniqueImpressions: number;
  clicks: number;
  uniqueClicks: number;
  ctr: number; // %
};

const emptyStats: Stats = {
  impressions: 0,
  uniqueImpressions: 0,
  clicks: 0,
  uniqueClicks: 0,
  ctr: 0,
};

function aggregate(rows: Row[], variant: 'A' | 'B'): Stats {
  const v = rows.filter((r) => r.variant === variant);
  const impressions = v.filter((r) => r.event_type === 'impression').length;
  const clicks = v.filter((r) => r.event_type === 'cta_click').length;
  const uniqueImpressions = new Set(
    v.filter((r) => r.event_type === 'impression').map((r) => r.session_id),
  ).size;
  const uniqueClicks = new Set(
    v.filter((r) => r.event_type === 'cta_click').map((r) => r.session_id),
  ).size;
  const ctr = uniqueImpressions > 0 ? (uniqueClicks / uniqueImpressions) * 100 : 0;
  return { impressions, uniqueImpressions, clicks, uniqueClicks, ctr };
}

export default function AbTestPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ab_card_events')
      .select('variant, event_type, session_id')
      .order('created_at', { ascending: false })
      .limit(50000);
    if (error) {
      toast.error('Falha ao carregar eventos: ' + error.message);
    } else {
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const statsA = useMemo(() => aggregate(rows, 'A'), [rows]);
  const statsB = useMemo(() => aggregate(rows, 'B'), [rows]);

  const winner: 'A' | 'B' | 'tie' | null = useMemo(() => {
    if (statsA.uniqueImpressions < 30 || statsB.uniqueImpressions < 30) return null;
    if (Math.abs(statsA.ctr - statsB.ctr) < 0.5) return 'tie';
    return statsA.ctr > statsB.ctr ? 'A' : 'B';
  }, [statsA, statsB]);

  const lift = statsA.ctr > 0 ? ((statsB.ctr - statsA.ctr) / statsA.ctr) * 100 : 0;

  const reset = async () => {
    const { error } = await supabase.from('ab_card_events').delete().not('id', 'is', null);
    if (error) {
      toast.error('Falha ao zerar: ' + error.message);
    } else {
      toast.success('Eventos apagados');
      load();
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={FlaskConical}
        title="A/B Test — Card de Produto"
        description="Compara o layout discreto (A) com o layout de conversão agressiva (B). Métrica principal: CTR de cliques únicos no botão Adicionar ao Carrinho."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30">
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Zerar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar todos os eventos do A/B?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é permanente. Os eventos de impressão e clique serão apagados e o teste recomeça do zero.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={reset}>Apagar tudo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Resumo do vencedor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Resultado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {winner === null ? (
            <p className="text-sm text-muted-foreground">
              Aguardando dados suficientes (mínimo 30 sessões únicas por variante).
              Atual: A = {statsA.uniqueImpressions} · B = {statsB.uniqueImpressions}.
            </p>
          ) : winner === 'tie' ? (
            <p className="text-sm">
              <Badge variant="secondary">Empate técnico</Badge>{' '}
              Diferença de CTR menor que 0,5 ponto percentual.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm">
                <Badge className={winner === 'B' ? 'bg-success text-white' : 'bg-primary text-primary-foreground'}>
                  Variante {winner} está vencendo
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                CTR A: {statsA.ctr.toFixed(2)}% · CTR B: {statsB.ctr.toFixed(2)}% · Lift de B sobre A: {lift >= 0 ? '+' : ''}
                {lift.toFixed(1)}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VariantPanel label="A — Layout discreto (controle)" tone="default" stats={statsA} />
        <VariantPanel label="B — Conversão agressiva" tone="primary" stats={statsB} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como testar manualmente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Acesse a home com um destes parâmetros para forçar uma variante:</p>
          <ul className="list-disc list-inside space-y-0.5 font-mono text-xs">
            <li>?ab=A — força layout antigo</li>
            <li>?ab=B — força layout novo</li>
            <li>?ab=off — desliga o tracking (não loga eventos)</li>
          </ul>
          <p className="pt-2">Cada visitante recebe uma variante 50/50 determinística pelo seu sessionId, salva em localStorage para manter consistência entre visitas.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function VariantPanel({
  label,
  tone,
  stats,
}: {
  label: string;
  tone: 'default' | 'primary';
  stats: Stats;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <AdminKpiCard
          label="Sessões impactadas"
          value={stats.uniqueImpressions.toLocaleString('pt-BR')}
          icon={Eye}
          tone={tone}
          hint={`${stats.impressions.toLocaleString('pt-BR')} impressões totais`}
        />
        <AdminKpiCard
          label="Cliques únicos no CTA"
          value={stats.uniqueClicks.toLocaleString('pt-BR')}
          icon={MousePointerClick}
          tone={tone}
          hint={`${stats.clicks.toLocaleString('pt-BR')} cliques totais`}
        />
        <div className="col-span-2">
          <AdminKpiCard
            label="CTR (cliques únicos / sessões)"
            value={`${stats.ctr.toFixed(2)}%`}
            icon={TrendingUp}
            tone={tone}
          />
        </div>
      </CardContent>
    </Card>
  );
}