import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProduct, createProduct, updateProduct, uploadFile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Plus, Trash2, ImagePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Variation {
  id?: string;
  dosage: string;
  price: number;
  in_stock: boolean;
  is_offer: boolean;
  image_url: string;
}

const emptyVariation = (): Variation => ({
  dosage: '',
  price: 0,
  in_stock: true,
  is_offer: false,
  image_url: '',
});

const ProductForm = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [pharmaForm, setPharmaForm] = useState('');
  const [administrationRoute, setAdministrationRoute] = useState('');
  const [frequency, setFrequency] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [variations, setVariations] = useState<Variation[]>([emptyVariation()]);
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);

  useEffect(() => {
    if (id) {
      setLoadingProduct(true);
      fetchProduct(id).then((p) => {
        setName(p.name);
        setSubtitle(p.subtitle || '');
        setDescription(p.description || '');
        setActiveIngredient(p.active_ingredient || '');
        setPharmaForm(p.pharma_form || '');
        setAdministrationRoute(p.administration_route || '');
        setFrequency(p.frequency || '');
        setImages(p.images || []);
        setVariations(
          p.product_variations?.length > 0
            ? p.product_variations.map((v: any) => ({
                id: v.id,
                dosage: v.dosage,
                price: Number(v.price),
                in_stock: v.in_stock,
                is_offer: v.is_offer,
                image_url: v.image_url || '',
              }))
            : [emptyVariation()]
        );
      }).finally(() => setLoadingProduct(false));
    }
  }, [id]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const path = `${crypto.randomUUID()}-${file.name}`;
        const url = await uploadFile('product-images', path, file);
        setImages((prev) => [...prev, url]);
      } catch (err: any) {
        toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
      }
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariation = (index: number, field: keyof Variation, value: any) => {
    setVariations((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        name,
        subtitle,
        description,
        active_ingredient: activeIngredient,
        pharma_form: pharmaForm,
        administration_route: administrationRoute,
        frequency,
        images,
        variations: variations.filter((v) => v.dosage.trim() !== ''),
      };

      if (isEditing && id) {
        await updateProduct(id, data);
        toast({ title: 'Produto atualizado!' });
      } else {
        await createProduct(data);
        toast({ title: 'Produto criado!' });
      }
      navigate('/admin/produtos');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingProduct) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/produtos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {isEditing ? 'Editar Produto' : 'Novo Produto'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Informações Básicas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Produto</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Liberty Pharma 5mg" required />
              </div>
              <div className="space-y-2">
                <Label>Princípio Ativo</Label>
                <Input value={activeIngredient} onChange={(e) => setActiveIngredient(e.target.value)} placeholder="Ex: Tirzepatide" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subtítulo</Label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Descrição curta" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes..." rows={3} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Forma Farmacêutica</Label>
                <Input value={pharmaForm} onChange={(e) => setPharmaForm(e.target.value)} placeholder="Solução Injetável" />
              </div>
              <div className="space-y-2">
                <Label>Via de Administração</Label>
                <Input value={administrationRoute} onChange={(e) => setAdministrationRoute(e.target.value)} placeholder="Subcutânea" />
              </div>
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Semanal" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Imagens</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-border group">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <Trash2 className="w-5 h-5 text-card" />
                  </button>
                </div>
              ))}
              <label className="w-24 h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center cursor-pointer transition-colors">
                <ImagePlus className="w-6 h-6 text-muted-foreground" />
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Variações / Dosagens</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setVariations((p) => [...p, emptyVariation()])}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {variations.map((v, i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border/30 space-y-3">
                <div className="flex items-end gap-3">
                  {/* Variation image */}
                  <div className="flex flex-col items-center gap-1">
                    <Label className="text-xs">Foto</Label>
                    {v.image_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                        <img src={v.image_url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => updateVariation(i, 'image_url', '')}
                          className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4 text-card" />
                        </button>
                      </div>
                    ) : (
                      <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center cursor-pointer transition-colors">
                        <ImagePlus className="w-4 h-4 text-muted-foreground" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const path = `variations/${crypto.randomUUID()}-${file.name}`;
                              const url = await uploadFile('product-images', path, file);
                              updateVariation(i, 'image_url', url);
                            } catch (err: any) {
                              toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label>Dosagem</Label>
                    <Input value={v.dosage} onChange={(e) => updateVariation(i, 'dosage', e.target.value)} placeholder="5mg" />
                  </div>
                  <div className="w-32 space-y-2">
                    <Label>Preço (R$)</Label>
                    <Input type="number" value={v.price || ''} onChange={(e) => updateVariation(i, 'price', Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Label className="text-xs">Estoque</Label>
                    <Switch checked={v.in_stock} onCheckedChange={(val) => updateVariation(i, 'in_stock', val)} />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Label className="text-xs">Oferta</Label>
                    <Switch checked={v.is_offer} onCheckedChange={(val) => updateVariation(i, 'is_offer', val)} />
                  </div>
                  {variations.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setVariations((p) => p.filter((_, j) => j !== i))} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" className="px-8" disabled={saving}>
            {saving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Produto'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/admin/produtos')}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
