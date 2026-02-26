import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProducts, Product, ProductVariation } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Trash2, ImagePlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const emptyVariation = (): ProductVariation => ({
  id: crypto.randomUUID(),
  dosage: '',
  price: 0,
  inStock: true,
  isOffer: false,
});

const ProductForm = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const { products, addProduct, updateProduct } = useProducts();
  const navigate = useNavigate();
  const { toast } = useToast();

  const existing = products.find((p) => p.id === id);

  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [pharmaForm, setPharmaForm] = useState('');
  const [administrationRoute, setAdministrationRoute] = useState('');
  const [frequency, setFrequency] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [variations, setVariations] = useState<ProductVariation[]>([emptyVariation()]);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setSubtitle(existing.subtitle);
      setDescription(existing.description);
      setActiveIngredient(existing.activeIngredient);
      setPharmaForm(existing.pharmaForm);
      setAdministrationRoute(existing.administrationRoute);
      setFrequency(existing.frequency);
      setImages(existing.images);
      setVariations(existing.variations.length > 0 ? existing.variations : [emptyVariation()]);
    }
  }, [existing]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariation = (index: number, field: keyof ProductVariation, value: any) => {
    setVariations((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  const addVariation = () => setVariations((prev) => [...prev, emptyVariation()]);
  const removeVariation = (index: number) =>
    setVariations((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name,
      subtitle,
      description,
      activeIngredient,
      pharmaForm,
      administrationRoute,
      frequency,
      images,
      variations: variations.filter((v) => v.dosage.trim() !== ''),
    };

    if (isEditing && id) {
      updateProduct(id, data);
      toast({ title: 'Produto atualizado com sucesso!' });
    } else {
      addProduct(data);
      toast({ title: 'Produto criado com sucesso!' });
    }
    navigate('/admin/produtos');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/produtos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {isEditing ? 'Editar Produto' : 'Novo Produto'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Informações Básicas</CardTitle>
          </CardHeader>
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
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Descrição curta do produto" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes do produto..." rows={3} />
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

        {/* Images */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Imagens</CardTitle>
          </CardHeader>
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

        {/* Variations */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Variações / Dosagens</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addVariation}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {variations.map((v, i) => (
              <div key={v.id} className="flex items-end gap-3 p-4 rounded-lg bg-muted/50 border border-border/30">
                <div className="flex-1 space-y-2">
                  <Label>Dosagem</Label>
                  <Input
                    value={v.dosage}
                    onChange={(e) => updateVariation(i, 'dosage', e.target.value)}
                    placeholder="5mg"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <Label>Preço (R$)</Label>
                  <Input
                    type="number"
                    value={v.price || ''}
                    onChange={(e) => updateVariation(i, 'price', Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Label className="text-xs">Estoque</Label>
                  <Switch
                    checked={v.inStock}
                    onCheckedChange={(val) => updateVariation(i, 'inStock', val)}
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Label className="text-xs">Oferta</Label>
                  <Switch
                    checked={v.isOffer || false}
                    onCheckedChange={(val) => updateVariation(i, 'isOffer', val)}
                  />
                </div>
                {variations.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeVariation(i)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" className="px-8">
            {isEditing ? 'Salvar Alterações' : 'Criar Produto'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/admin/produtos')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
