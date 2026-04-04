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
  fantasy_name: string | null;
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
  const [activeGateway, setActiveGateway] = useState<string>('');
  const [gatewayEnv, setGatewayEnv] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentLink | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [fantasyName, setFantasyName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [active, setActive] = useState(true);
  const [pixDiscount, setPixDiscount] = useState('0');
  const [maxInstallments, setMaxInstallments] = useState('1');

  const totalAmount = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  const fetchLinks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setLinks((data as PaymentLink[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); fetchGateway(); }, []);

  const fetchGateway = async () => {
    const { data } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['payment_gateway', 'asaas_environment', 'mercadopago_environment']);
    if (data) {
      const gw = data.find(d => d.key === 'payment_gateway')?.value || 'asaas';
      setActiveGateway(gw);
      if (gw === 'mercadopago') {
        setGatewayEnv(data.find(d => d.key === 'mercadopago_environment')?.value || 'sandbox');
      } else {
        setGatewayEnv(data.find(d => d.key === 'asaas_environment')?.value || 'sandbox');
      }
    }
  };

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setFantasyName('');
    setDescription('');
    setQuantity('1');
    setUnitPrice('');
    setActive(true);
    setPixDiscount('0');
    setMaxInstallments('1');
    setDialogOpen(true);
  };

  const openEdit = (link: PaymentLink) => {
    setEditing(link);
    setTitle(link.title);
    setFantasyName(link.fantasy_name || '');
    setDescription(link.description || '');
    const qty = (link as any).quantity || 1;
    setQuantity(String(qty));
    setUnitPrice(String(qty > 0 ? link.amount / qty : link.amount));
    setActive(link.active);
    setPixDiscount(String(link.pix_discount_percent || 0));
    setMaxInstallments(String(link.max_installments || 1));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !unitPrice || Number(unitPrice) <= 0 || !quantity || Number(quantity) < 1) {
      toast({ title: 'Preencha o título, quantidade e valor unitário válidos.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    const payload = {
      title: title.trim(),
      fantasy_name: fantasyName.trim() || null,
      description: description.trim(),
      amount: Number(totalAmount.toFixed(2)),
      active,
      pix_discount_percent: Number(pixDiscount) || 0,
      max_installments: Number(maxInstallments) || 1,
    };

    if (editing) {
      const { error } = await supabase
        .from('payment_links')
        .update(payload)
        .eq('id', editing.id);
      if (error) toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
      else toast({ title: 'Link atualizado!' });
    } else {
      const { error } = await supabase
        .from('payment_links')
        .insert({ ...payload, slug: generateSlug(), user_id: session.user.id });
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
              <Label>Nome Fantasia (opcional)</Label>
              <Input value={fantasyName} onChange={(e) => setFantasyName(e.target.value)} placeholder="Nome usado na API de pagamento" />
              <p className="text-xs text-muted-foreground">Se preenchido, será usado no lugar do título ao enviar para a API de pagamento.</p>
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes do pagamento..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
              </div>
              <div className="space-y-2">
                <Label>Valor Unitário (R$) *</Label>
                <Input type="number" min="0.01" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div className="rounded-md bg-muted p-3 text-center">
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="text-2xl font-bold text-primary">
                R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              {Number(quantity) > 1 && Number(unitPrice) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {quantity}x de R$ {Number(unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Desconto PIX (%)</Label>
                <Input type="number" min="0" max="100" step="1" value={pixDiscount} onChange={(e) => setPixDiscount(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Máx. Parcelas</Label>
                <Input type="number" min="1" max="12" step="1" value={maxInstallments} onChange={(e) => setMaxInstallments(e.target.value)} placeholder="1" />
              </div>
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
