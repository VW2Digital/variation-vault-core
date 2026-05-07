import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
interface PaymentLinkOpt { id: string; title: string; slug: string; }

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || Math.random().toString(36).slice(2, 10);

export default function FlashCampaignsPage() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [links, setLinks] = useState<PaymentLinkOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('OFERTA RELÂMPAGO');
  const [subheadline, setSubheadline] = useState('Por tempo limitadíssimo. Garanta antes que acabe.');
  const [ctaText, setCtaText] = useState('GARANTIR AGORA');
  const [paymentLinkId, setPaymentLinkId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [bgImage, setBgImage] = useState('');
  const [bgColor, setBgColor] = useState('#0a0000');
  const [accentColor, setAccentColor] = useState('#ef4444');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: cmps }, { data: st }, { data: pls }] = await Promise.all([
      supabase.from('flash_campaigns' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('flash_campaign_stats' as any).select('*'),
      supabase.from('payment_links').select('id,title,slug').eq('active', true).order('created_at', { ascending: false }),
    ]);
    setCampaigns((cmps as any) || []);
    const map: Record<string, Stat> = {};
    ((st as any) || []).forEach((s: Stat) => { map[s.campaign_id] = s; });
    setStats(map);
    setLinks((pls as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setEditing(null); setTitle(''); setSlug(''); setHeadline('OFERTA RELÂMPAGO');
    setSubheadline('Por tempo limitadíssimo. Garanta antes que acabe.');
    setCtaText('GARANTIR AGORA'); setPaymentLinkId(''); setExpiresAt('');
    setBgImage(''); setBgColor('#0a0000'); setAccentColor('#ef4444'); setActive(true);
  };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (c: Campaign) => {
    setEditing(c); setTitle(c.title); setSlug(c.slug); setHeadline(c.headline);
    setSubheadline(c.subheadline); setCtaText(c.cta_text); setPaymentLinkId(c.payment_link_id);
    setExpiresAt(c.expires_at?.slice(0, 16) || ''); setBgImage(c.background_image || '');
    setBgColor(c.bg_color || '#0a0000'); setAccentColor(c.accent_color || '#ef4444');
    setActive(c.active); setOpen(true);
  };

  const save = async () => {
    if (!title.trim() || !paymentLinkId || !expiresAt) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha título, link de pagamento e validade.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const finalSlug = (slug.trim() || slugify(title)).toLowerCase();
    const payload: any = {
      title: title.trim(), slug: finalSlug, headline: headline.trim(), subheadline: subheadline.trim(),
      cta_text: ctaText.trim() || 'GARANTIR AGORA', payment_link_id: paymentLinkId,
      expires_at: new Date(expiresAt).toISOString(), background_image: bgImage.trim() || null,
      bg_color: bgColor, accent_color: accentColor, active,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from('flash_campaigns' as any).update(payload).eq('id', editing.id));
    } else {
      payload.user_id = user?.id;
      ({ error } = await supabase.from('flash_campaigns' as any).insert(payload));
    }
    setSaving(false);
    if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Campanha atualizada' : 'Campanha criada' });
    setOpen(false); reset(); load();
  };

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
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Nova campanha</Button>}
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
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil className="w-3 h-3 mr-1" />Editar</Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(c)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar campanha' : 'Nova campanha relâmpago'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Título interno *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Black Friday" /></div>
              <div><Label>Slug (URL)</Label><Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto" /></div>
            </div>
            <div>
              <Label>Link de pagamento *</Label>
              <Select value={paymentLinkId} onValueChange={setPaymentLinkId}>
                <SelectTrigger><SelectValue placeholder="Selecione um link de pagamento" /></SelectTrigger>
                <SelectContent>
                  {links.map(l => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {links.length === 0 && <p className="text-xs text-muted-foreground mt-1">Crie um link em "Links de Pagamento" antes.</p>}
            </div>
            <div><Label>Validade *</Label><Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></div>
            <div><Label>Headline (chamada principal)</Label><Input value={headline} onChange={e => setHeadline(e.target.value)} /></div>
            <div><Label>Subheadline</Label><Textarea value={subheadline} onChange={e => setSubheadline(e.target.value)} rows={2} /></div>
            <div><Label>Texto do botão</Label><Input value={ctaText} onChange={e => setCtaText(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cor de fundo</Label><Input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} /></div>
              <div><Label>Cor de destaque</Label><Input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} /></div>
            </div>
            <div><Label>Imagem de fundo (URL opcional)</Label><Input value={bgImage} onChange={e => setBgImage(e.target.value)} placeholder="https://..." /></div>
            <div className="flex items-center gap-2"><Switch checked={active} onCheckedChange={setActive} /><Label>Campanha ativa</Label></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

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