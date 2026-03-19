import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Copy, Trash2, Pencil, Link as LinkIcon, ExternalLink, Loader2 } from 'lucide-react';

interface PaymentLink {
  id: string;
  title: string;
  description: string;
  amount: number;
  active: boolean;
  slug: string;
  created_at: string;
  user_id: string;
  pix_discount_percent: number;
  max_installments: number;
}

const generateSlug = () => {
  return Math.random().toString(36).substring(2, 10);
};

export default function PaymentLinksPage() {
  const { toast } = useToast();
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentLink | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [active, setActive] = useState(true);
  const [pixDiscount, setPixDiscount] = useState('0');
  const [maxInstallments, setMaxInstallments] = useState('1');

  const fetchLinks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setLinks((data as PaymentLink[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); }, []);

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setAmount('');
    setActive(true);
    setPixDiscount('0');
    setMaxInstallments('1');
    setDialogOpen(true);
  };

  const openEdit = (link: PaymentLink) => {
    setEditing(link);
    setTitle(link.title);
    setDescription(link.description || '');
    setAmount(String(link.amount));
    setActive(link.active);
    setPixDiscount(String(link.pix_discount_percent || 0));
    setMaxInstallments(String(link.max_installments || 1));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !amount || Number(amount) <= 0) {
      toast({ title: 'Preencha o título e um valor válido.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    if (editing) {
      const { error } = await supabase
        .from('payment_links')
        .update({ title: title.trim(), description: description.trim(), amount: Number(amount), active })
        .eq('id', editing.id);
      if (error) toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      else toast({ title: 'Link atualizado!' });
    } else {
      const { error } = await supabase
        .from('payment_links')
        .insert({ title: title.trim(), description: description.trim(), amount: Number(amount), active, slug: generateSlug(), user_id: session.user.id });
      if (error) toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      else toast({ title: 'Link criado com sucesso!' });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchLinks();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('payment_links').delete().eq('id', deleteTarget.id);
    toast({ title: 'Link excluído.' });
    setDeleteTarget(null);
    fetchLinks();
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/pagar/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Links de Pagamento</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Link
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <LinkIcon className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <h3 className="font-semibold text-foreground">Nenhum link criado</h3>
            <p className="text-sm text-muted-foreground">Crie links de pagamento com valores personalizados para enviar aos seus clientes.</p>
            <Button onClick={openCreate} className="gap-2 mt-2">
              <Plus className="w-4 h-4" /> Criar Primeiro Link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {links.map((link) => (
            <Card key={link.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground truncate">{link.title}</h3>
                      <Badge variant={link.active ? 'default' : 'secondary'}>
                        {link.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    {link.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{link.description}</p>
                    )}
                    <p className="text-lg font-bold text-primary">
                      R$ {Number(link.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {window.location.origin}/pagar/{link.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copyLink(link.slug)} className="gap-1">
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/pagar/${link.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(link)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(link)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Link' : 'Novo Link de Pagamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Consulta, Orçamento #123" />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes do pagamento..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Link ativo</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editing ? 'Salvar Alterações' : 'Criar Link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir link?</AlertDialogTitle>
            <AlertDialogDescription>
              O link "{deleteTarget?.title}" será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
