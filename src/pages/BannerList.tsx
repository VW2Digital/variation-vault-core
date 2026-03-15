import { useState, useEffect } from 'react';
import { fetchAllBanners, createBanner, updateBanner, deleteBanner, fetchBannerSlides, createBannerSlide, updateBannerSlide, deleteBannerSlide, fetchProducts, uploadFile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Megaphone, Image, Monitor, Tablet, Smartphone, GripVertical, Pencil, X, Save, Link as LinkIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// ── Slide Form types ──
interface SlideForm {
  title: string;
  image_desktop: string;
  image_tablet: string;
  image_mobile: string;
  link_url: string;
  product_id: string | null;
}

const emptyForm: SlideForm = {
  title: '',
  image_desktop: '',
  image_tablet: '',
  image_mobile: '',
  link_url: '',
  product_id: null,
};

const BannerList = () => {
  // ── Text Banners state ──
  const [banners, setBanners] = useState<any[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [newText, setNewText] = useState('');
  const [savingBanner, setSavingBanner] = useState(false);

  // ── Image Slides state ──
  const [slides, setSlides] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingSlides, setLoadingSlides] = useState(true);
  const [savingSlide, setSavingSlide] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SlideForm>(emptyForm);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const { toast } = useToast();

  // ── Loaders ──
  const loadBanners = () => {
    setLoadingBanners(true);
    fetchAllBanners().then(setBanners).finally(() => setLoadingBanners(false));
  };

  const loadSlides = async () => {
    setLoadingSlides(true);
    try {
      const [s, p] = await Promise.all([fetchBannerSlides(), fetchProducts()]);
      setSlides(s);
      setProducts(p);
    } finally {
      setLoadingSlides(false);
    }
  };

  useEffect(() => { loadBanners(); loadSlides(); }, []);

  // ══════════════════════════════════════
  // TEXT BANNER handlers
  // ══════════════════════════════════════
  const handleCreateBanner = async () => {
    if (!newText.trim()) return;
    setSavingBanner(true);
    try {
      await createBanner(newText.trim());
      setNewText('');
      toast({ title: 'Banner criado!' });
      loadBanners();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingBanner(false);
    }
  };

  const handleToggleBanner = async (id: string, active: boolean) => {
    try {
      await updateBanner(id, { active });
      setBanners(prev => prev.map(b => (b.id === id ? { ...b, active } : b)));
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      await deleteBanner(id);
      setBanners(prev => prev.filter(b => b.id !== id));
      toast({ title: 'Banner removido' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  // ══════════════════════════════════════
  // IMAGE SLIDE handlers
  // ══════════════════════════════════════
  const handleUpload = async (field: 'image_desktop' | 'image_tablet' | 'image_mobile', file: File) => {
    setUploading(prev => ({ ...prev, [field]: true }));
    try {
      const path = `slides/${Date.now()}-${field}-${file.name}`;
      const url = await uploadFile('banner-images', path, file);
      setForm(prev => ({ ...prev, [field]: url }));
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleSaveSlide = async () => {
    if (!form.image_desktop && !form.image_tablet && !form.image_mobile) {
      toast({ title: 'Adicione pelo menos uma imagem', variant: 'destructive' });
      return;
    }
    setSavingSlide(true);
    try {
      const payload = {
        title: form.title,
        image_desktop: form.image_desktop,
        image_tablet: form.image_tablet,
        image_mobile: form.image_mobile,
        link_url: form.link_url,
        product_id: form.product_id || null,
      };
      if (editId) {
        await updateBannerSlide(editId, payload);
        toast({ title: 'Slide atualizado!' });
      } else {
        await createBannerSlide({ ...payload, sort_order: slides.length });
        toast({ title: 'Slide criado!' });
      }
      setForm(emptyForm);
      setEditId(null);
      setDialogOpen(false);
      loadSlides();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSlide(false);
    }
  };

  const handleEditSlide = (slide: any) => {
    setEditId(slide.id);
    setForm({
      title: slide.title || '',
      image_desktop: slide.image_desktop || '',
      image_tablet: slide.image_tablet || '',
      image_mobile: slide.image_mobile || '',
      link_url: slide.link_url || '',
      product_id: slide.product_id || null,
    });
    setDialogOpen(true);
  };

  const handleDeleteSlide = async (id: string) => {
    try {
      await deleteBannerSlide(id);
      setSlides(prev => prev.filter(s => s.id !== id));
      toast({ title: 'Slide removido' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleSlide = async (id: string, active: boolean) => {
    try {
      await updateBannerSlide(id, { active });
      setSlides(prev => prev.map(s => s.id === id ? { ...s, active } : s));
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const ImageUploadField = ({
    label, icon: Icon, field, ratio,
  }: {
    label: string; icon: any; field: 'image_desktop' | 'image_tablet' | 'image_mobile'; ratio: string;
  }) => (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <Icon className="w-4 h-4" /> {label} <span className="text-muted-foreground text-xs">({ratio})</span>
      </Label>
      {form[field] ? (
        <div className="relative rounded-lg border border-border overflow-hidden bg-muted/30">
          <img src={form[field]} alt={label} className="w-full h-32 object-cover" />
          <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => setForm(prev => ({ ...prev, [field]: '' }))}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border/50 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
          <Image className="w-8 h-8 text-muted-foreground mb-2" />
          <span className="text-xs text-muted-foreground">{uploading[field] ? 'Enviando...' : 'Clique para enviar'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(field, f); }} />
        </label>
      )}
    </div>
  );

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════
  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Banners</h1>
      </div>

      <Tabs defaultValue="text" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="text" className="gap-2">
            <Megaphone className="w-4 h-4" /> Banners de Texto
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-2">
            <Image className="w-4 h-4" /> Banner de Imagens
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Text Banners ── */}
        <TabsContent value="text" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Novo Banner</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Ex: 🔥 PROMOÇÃO ESPECIAL — FALE CONOSCO!"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateBanner()}
                  className="flex-1"
                />
                <Button onClick={handleCreateBanner} disabled={savingBanner || !newText.trim()} className="shrink-0">
                  <Plus className="mr-1 h-4 w-4" /> Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Banners Ativos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingBanners ? (
                <p className="text-muted-foreground text-sm">Carregando...</p>
              ) : banners.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum banner cadastrado.</p>
              ) : (
                banners.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 p-3 rounded-lg border border-border/30 bg-muted/30">
                    <Switch checked={b.active} onCheckedChange={(val) => handleToggleBanner(b.id, val)} />
                    <span className={`flex-1 min-w-0 text-sm truncate ${b.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                      {b.text}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteBanner(b.id)} className="text-destructive shrink-0 h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Image Slides ── */}
        <TabsContent value="images" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm(emptyForm); setEditId(null); } }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-1 h-4 w-4" /> Novo Slide</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editId ? 'Editar Slide' : 'Novo Slide'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Título (opcional)</Label>
                    <Input value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Ex: Promoção de Verão" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ImageUploadField label="Desktop" icon={Monitor} field="image_desktop" ratio="1920×600" />
                    <ImageUploadField label="Tablet" icon={Tablet} field="image_tablet" ratio="768×400" />
                    <ImageUploadField label="Smartphone" icon={Smartphone} field="image_mobile" ratio="390×300" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Link de redirecionamento</Label>
                      <Input value={form.link_url} onChange={(e) => setForm(prev => ({ ...prev, link_url: e.target.value }))} placeholder="https://... ou /catalogo" />
                    </div>
                    <div>
                      <Label>Associar a um Produto</Label>
                      <Select value={form.product_id || 'none'} onValueChange={(val) => setForm(prev => ({ ...prev, product_id: val === 'none' ? null : val }))}>
                        <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Se selecionado, o clique levará à página do produto.</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setDialogOpen(false); setForm(emptyForm); setEditId(null); }}>Cancelar</Button>
                    <Button onClick={handleSaveSlide} disabled={savingSlide}><Save className="mr-1 h-4 w-4" /> {savingSlide ? 'Salvando...' : 'Salvar'}</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Slides Cadastrados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingSlides ? (
                <p className="text-muted-foreground text-sm">Carregando...</p>
              ) : slides.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum slide cadastrado.</p>
              ) : (
                slides.map((slide) => (
                  <div key={slide.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg border border-border/30 bg-muted/30">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0 hidden sm:block" />
                      <div className="w-12 h-8 sm:w-16 sm:h-10 rounded overflow-hidden bg-muted shrink-0">
                        {slide.image_desktop ? (
                          <img src={slide.image_desktop} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Image className="w-4 h-4 text-muted-foreground" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{slide.title || 'Sem título'}</p>
                        <div className="flex gap-2 text-[10px] text-muted-foreground">
                          {slide.image_desktop && <span className="flex items-center gap-0.5"><Monitor className="w-3 h-3" /> Desktop</span>}
                          {slide.image_tablet && <span className="flex items-center gap-0.5"><Tablet className="w-3 h-3" /> Tablet</span>}
                          {slide.image_mobile && <span className="flex items-center gap-0.5"><Smartphone className="w-3 h-3" /> Mobile</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      <Switch checked={slide.active} onCheckedChange={(val) => handleToggleSlide(slide.id, val)} />
                      <Button variant="ghost" size="icon" onClick={() => handleEditSlide(slide)} className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteSlide(slide.id)} className="text-destructive h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BannerList;
