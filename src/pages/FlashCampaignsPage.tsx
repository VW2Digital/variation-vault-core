import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Plus, Pencil, Trash2, ExternalLink, Copy, Zap, Eye, MousePointerClick, TrendingUp } from 'lucide-react';

interface Campaign {
  id: string;
  slug: string;
  title: string;
  headline: string;
  subheadline: string;
  cta_text: string;
  payment_link_id: string;
  expires_at: string;
  background_image: string | null;
  bg_color: string | null;
  accent_color: string | null;
  active: boolean;
}
interface Stat { campaign_id: string; views: number; clicks: number; conversions: number; conversion_rate: number; }

export default function FlashCampaignsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: cmps }, { data: st }] = await Promise.all([
      supabase.from('flash_campaigns' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('flash_campaign_stats' as any).select('*'),
    ]);
    setCampaigns((cmps as any) || []);
    const map: Record<string, Stat> = {};
    ((st as any) || []).forEach((s: Stat) => { map[s.campaign_id] = s; });
    setStats(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('flash_campaigns' as any).delete().eq('id', deleteTarget.id);
    if (error) toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    else toast({ title: 'Campanha excluída' });
    setDeleteTarget(null); load();
  };

  const copyUrl = (s: string) => {
    const url = `${window.location.origin}/relampago/${s}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado', description: url });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Zap}
        title="Campanhas Relâmpago"
        description="Crie páginas de campanha com cronômetro de urgência e contabilize a conversão"
        actions={<Button onClick={() => navigate('/admin/campanhas-relampago/nova')}><Plus className="w-4 h-4 mr-2" />Nova campanha</Button>}
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhuma campanha criada ainda.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map(c => {
            const s = stats[c.id] || { views: 0, clicks: 0, conversions: 0, conversion_rate: 0 };
            const expired = new Date(c.expires_at) < new Date();
            return (
              <Card key={c.id} className="overflow-hidden">
                <div className="h-2" style={{ background: c.accent_color || '#ef4444' }} />
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{c.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">/relampago/{c.slug}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {c.active ? <Badge variant="default">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}
                      {expired && <Badge variant="destructive">Expirada</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted p-2">
                      <Eye className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-sm font-bold">{s.views}</div>
                      <div className="text-[10px] text-muted-foreground">Views</div>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <MousePointerClick className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-sm font-bold">{s.clicks}</div>
                      <div className="text-[10px] text-muted-foreground">Cliques</div>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <TrendingUp className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-sm font-bold">{s.conversions}</div>
                      <div className="text-[10px] text-muted-foreground">{s.conversion_rate}%</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline"><Link to={`/relampago/${c.slug}`} target="_blank"><ExternalLink className="w-3 h-3 mr-1" />Abrir</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => copyUrl(c.slug)}><Copy className="w-3 h-3 mr-1" />Copiar URL</Button>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/admin/campanhas-relampago/${c.id}`)}><Pencil className="w-3 h-3 mr-1" />Editar</Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(c)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é permanente e remove também todas as estatísticas registradas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}