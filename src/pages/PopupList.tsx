import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Image, Calendar, Link2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Popup {
  id: string;
  title: string;
  image_url: string;
  product_id: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  user_id: string;
}

interface Product {
  id: string;
  name: string;
}

const PopupList = () => {
  const { toast } = useToast();
  const [popups, setPopups] = useState<Popup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPopup, setEditingPopup] = useState<Popup | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [productId, setProductId] = useState<string>('');
  const [active, setActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  const fetchPopups = async () => {
    const { data } = await supabase
      .from('popups')
      .select('*')
      .order('created_at', { ascending: false });
    setPopups((data as any[]) || []);
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name')
      .order('name');
    setProducts(data || []);
  };

  useEffect(() => {
    fetchPopups();
    fetchProducts();
  }, []);

  const resetForm = () => {
    setTitle('');
    setImageFile(null);
    setImagePreview('');
    setProductId('');
    setActive(true);
    setExpiresAt(undefined);
    setEditingPopup(null);
  };

  const openEdit = (popup: Popup) => {
    setEditingPopup(popup);
    setTitle(popup.title);
    setImagePreview(popup.image_url);
    setProductId(popup.product_id || '');
    setActive(popup.active);
    setExpiresAt(popup.expires_at ? new Date(popup.expires_at) : undefined);
    setDialogOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop();
    const path = `popup-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('banner-images').upload(path, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('banner-images').getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: 'Título é obrigatório', variant: 'destructive' });
      return;
    }
    if (!imagePreview && !imageFile) {
      toast({ title: 'Imagem é obrigatória', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      let imageUrl = editingPopup?.image_url || '';
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }

      const popupData = {
        title: title.trim(),
        image_url: imageUrl,
        product_id: productId || null,
        active,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        user_id: session.user.id,
      };

      if (editingPopup) {
        await supabase.from('popups').update(popupData as any).eq('id', editingPopup.id);
        toast({ title: 'Popup atualizado!' });
      } else {
        await supabase.from('popups').insert(popupData as any);
        toast({ title: 'Popup criado!' });
      }

      resetForm();
      setDialogOpen(false);
      fetchPopups();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('popups').delete().eq('id', id);
    toast({ title: 'Popup excluído!' });
    fetchPopups();
  };

  const toggleActive = async (popup: Popup) => {
    await supabase.from('popups').update({ active: !popup.active } as any).eq('id', popup.id);
    fetchPopups();
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Popups Promocionais</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo Popup</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingPopup ? 'Editar Popup' : 'Novo Popup'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Promoção de Lançamento" />
              </div>

              <div className="space-y-1.5">
                <Label>Imagem *</Label>
                <Input type="file" accept="image/*" onChange={handleImageChange} />
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain rounded-lg border border-border mt-2" />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Vincular a Produto</Label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Nenhum (apenas imagem)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Data de Validade</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !expiresAt && "text-muted-foreground")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {expiresAt ? format(expiresAt, "dd/MM/yyyy", { locale: ptBR }) : 'Sem data de validade'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={expiresAt}
                      onSelect={setExpiresAt}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {expiresAt && (
                  <Button variant="ghost" size="sm" onClick={() => setExpiresAt(undefined)} className="text-xs text-muted-foreground">
                    Remover data
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <Label>Ativo</Label>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? 'Salvando...' : editingPopup ? 'Salvar Alterações' : 'Criar Popup'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {popups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum popup cadastrado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {popups.map((popup) => {
            const expired = isExpired(popup.expires_at);
            const linkedProduct = products.find(p => p.id === popup.product_id);

            return (
              <Card key={popup.id} className={cn("overflow-hidden", (!popup.active || expired) && "opacity-60")}>
                <div className="relative aspect-[4/3] bg-muted">
                  {popup.image_url ? (
                    <img src={popup.image_url} alt={popup.title} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {popup.active && !expired && <Badge className="bg-success text-success-foreground">Ativo</Badge>}
                    {!popup.active && <Badge variant="secondary">Inativo</Badge>}
                    {expired && <Badge variant="destructive">Expirado</Badge>}
                  </div>
                </div>
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold text-foreground text-sm">{popup.title}</h3>
                  
                  {linkedProduct && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="w-3 h-3" />
                      <span>{linkedProduct.name}</span>
                    </div>
                  )}
                  
                  {popup.expires_at && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>Expira: {format(new Date(popup.expires_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <Switch checked={popup.active} onCheckedChange={() => toggleActive(popup)} />
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(popup)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir popup?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(popup.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PopupList;
