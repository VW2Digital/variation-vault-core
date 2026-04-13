import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchProduct, createProduct, updateProduct, uploadFile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Plus, Trash2, ImagePlus, CreditCard } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface WholesaleTier {
  id?: string;
  min_quantity: number;
  price: number;
}

interface Variation {
  id?: string;
  dosage: string;
  subtitle: string;
  price: number;
  offer_price: number;
  in_stock: boolean;
  is_offer: boolean;
  image_url: string;
  images: string[];
  stock_quantity: number;
  wholesale_prices: WholesaleTier[];
}

const emptyVariation = (): Variation => ({
  dosage: '',
  subtitle: '',
  price: 0,
  offer_price: 0,
  in_stock: true,
  is_offer: false,
  image_url: '',
  images: [],
  stock_quantity: 0,
  wholesale_prices: [],
});

const ProductForm = () => {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [fantasyName, setFantasyName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [pharmaForm, setPharmaForm] = useState('');
  const [administrationRoute, setAdministrationRoute] = useState('');
  const [frequency, setFrequency] = useState('');
  const [freeShipping, setFreeShipping] = useState(false);
  const [freeShippingMinValue, setFreeShippingMinValue] = useState(0);
  const [isBestseller, setIsBestseller] = useState(false);
  const [pixDiscountPercent, setPixDiscountPercent] = useState(0);
  const [maxInstallments, setMaxInstallments] = useState(6);
  const [installmentsInterest, setInstallmentsInterest] = useState('sem_juros');
  const [variations, setVariations] = useState<Variation[]>([emptyVariation()]);
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);

  useEffect(() => {
    if (id) {
      setLoadingProduct(true);
      fetchProduct(id).then(async (p) => {
        setName(p.name);
        setFantasyName((p as any).fantasy_name || '');
        setSubtitle(p.subtitle || '');
        setDescription(p.description || '');
        setActiveIngredient(p.active_ingredient || '');
        setPharmaForm(p.pharma_form || '');
        setAdministrationRoute(p.administration_route || '');
        setFrequency(p.frequency || '');
        setFreeShipping(p.free_shipping || false);
        setFreeShippingMinValue(Number(p.free_shipping_min_value) || 0);
        setPixDiscountPercent(Number((p as any).pix_discount_percent) || 0);
        setMaxInstallments(Number((p as any).max_installments) || 6);
        setInstallmentsInterest((p as any).installments_interest || 'sem_juros');
        setIsBestseller(p.is_bestseller || false);
        // Fetch wholesale prices for all variations
        const varIds = (p.product_variations || []).map((v: any) => v.id);
        let wholesaleMap: Record<string, WholesaleTier[]> = {};
        if (varIds.length > 0) {
          const { data: wp } = await supabase
            .from('wholesale_prices')
            .select('*')
            .in('variation_id', varIds)
            .order('min_quantity', { ascending: true });
          (wp || []).forEach((w: any) => {
            if (!wholesaleMap[w.variation_id]) wholesaleMap[w.variation_id] = [];
            wholesaleMap[w.variation_id].push({ id: w.id, min_quantity: w.min_quantity, price: Number(w.price) });
          });
        }
        setVariations(
          p.product_variations?.length > 0
            ? p.product_variations.map((v: any) => ({
                id: v.id,
                dosage: v.dosage,
                subtitle: v.subtitle || '',
                price: Number(v.price),
                offer_price: Number(v.offer_price || 0),
                in_stock: v.in_stock,
                is_offer: v.is_offer,
                image_url: v.image_url || '',
                images: v.images || [],
                wholesale_prices: wholesaleMap[v.id] || [],
              }))
            : [emptyVariation()]
        );
      }).finally(() => setLoadingProduct(false));
    }
  }, [id]);

  const updateVariation = (index: number, field: keyof Variation, value: any) => {
    setVariations((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        name,
        fantasy_name: fantasyName,
        subtitle,
        description,
        active_ingredient: activeIngredient,
        pharma_form: pharmaForm,
        administration_route: administrationRoute,
        frequency,
        free_shipping: freeShipping,
        free_shipping_min_value: freeShippingMinValue,
        is_bestseller: isBestseller,
        pix_discount_percent: pixDiscountPercent,
        max_installments: maxInstallments,
        installments_interest: installmentsInterest,
        variations: variations.filter((v) => v.dosage.trim() !== ''),
      };

      let savedProduct: any;
      if (isEditing && id) {
        await updateProduct(id, data);
        savedProduct = { id };
        toast({ title: 'Produto atualizado!' });
      } else {
        savedProduct = await createProduct(data);
        toast({ title: 'Produto criado!' });
      }

      // Save wholesale prices for each variation
      const productId = savedProduct?.id || id;
      if (productId) {
        // Fetch the saved variations to get their IDs
        const { data: savedVars } = await supabase
          .from('product_variations')
          .select('id, dosage')
          .eq('product_id', productId);
        
        if (savedVars) {
          for (const sv of savedVars) {
            const matchingVar = variations.find(v => v.dosage === sv.dosage);
            if (matchingVar && matchingVar.wholesale_prices.length > 0) {
              // Delete existing wholesale prices for this variation
              await supabase.from('wholesale_prices').delete().eq('variation_id', sv.id);
              // Insert new ones
              await supabase.from('wholesale_prices').insert(
                matchingVar.wholesale_prices.map(wp => ({
                  variation_id: sv.id,
                  min_quantity: wp.min_quantity,
                  price: wp.price,
                }))
              );
            } else {
              // No wholesale prices, clean up
              await supabase.from('wholesale_prices').delete().eq('variation_id', sv.id);
            }
          }
        }
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
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">
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
              <Label>Nome Fantasia (usado na API de pagamento)</Label>
              <Input value={fantasyName} onChange={(e) => setFantasyName(e.target.value)} placeholder="Nome que aparecerá na fatura do cliente" />
              <p className="text-xs text-muted-foreground">Se preenchido, será usado no lugar do nome do produto ao enviar para a API de pagamento. Visível apenas para administradores.</p>
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
          <CardHeader><CardTitle className="text-lg">Destaques</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Mais Vendido</Label>
                <p className="text-xs text-muted-foreground">Destacar este produto como mais vendido no catálogo</p>
              </div>
              <Switch checked={isBestseller} onCheckedChange={setIsBestseller} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Frete Grátis</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ativar frete grátis</Label>
                <p className="text-xs text-muted-foreground">Ofereça frete grátis para este produto</p>
              </div>
              <Switch checked={freeShipping} onCheckedChange={setFreeShipping} />
            </div>
            {freeShipping && (
              <div className="space-y-2">
                <Label>Valor mínimo para frete grátis (R$)</Label>
                <Input
                  type="number"
                  value={freeShippingMinValue || ''}
                  onChange={(e) => setFreeShippingMinValue(Number(e.target.value))}
                  placeholder="0 = sem valor mínimo"
                />
                <p className="text-xs text-muted-foreground">
                  {freeShippingMinValue > 0
                    ? `Frete grátis para compras até R$ ${freeShippingMinValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : 'Frete grátis para qualquer valor de compra'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Formas de Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Desconto PIX (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={pixDiscountPercent || ''}
                  onChange={(e) => setPixDiscountPercent(Number(e.target.value))}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Percentual de desconto para pagamento via PIX
                </p>
              </div>
              <div className="space-y-2">
                <Label>Máx. Parcelas</Label>
                <Select value={String(maxInstallments)} onValueChange={(v) => setMaxInstallments(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Máximo de parcelas no catálogo e checkout
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Parcelas</Label>
                <Select value={installmentsInterest} onValueChange={setInstallmentsInterest}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_juros">Sem juros</SelectItem>
                    <SelectItem value="com_juros">Com juros</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Define se as parcelas são exibidas como "sem juros" ou "com juros"
                </p>
              </div>
            </div>
            <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Preview:</p>
              <p className="text-success text-xs font-semibold">{pixDiscountPercent}% OFF no Pix</p>
              <p className="text-[11px]">ou R$ 100,00 em {maxInstallments}x R$ {(100 / maxInstallments).toFixed(2).replace('.', ',')}{installmentsInterest === 'sem_juros' ? ' sem juros' : ''}</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Dosagem</Label>
                    <Input value={v.dosage} onChange={(e) => updateVariation(i, 'dosage', e.target.value)} placeholder="5mg" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Subtítulo da Variação</Label>
                    <Input value={v.subtitle} onChange={(e) => updateVariation(i, 'subtitle', e.target.value)} placeholder="Ex: contém um total de 20mg, dividida em 4 doses de 15mg." />
                  </div>
                  <div className="space-y-2">
                    <Label>{v.is_offer ? 'Preço Original (R$)' : 'Preço (R$)'}</Label>
                    <Input type="number" value={v.price || ''} onChange={(e) => updateVariation(i, 'price', Number(e.target.value))} />
                  </div>
                  {v.is_offer && (
                    <div className="space-y-2">
                      <Label className="text-destructive">Preço Oferta (R$)</Label>
                      <Input type="number" value={v.offer_price || ''} onChange={(e) => updateVariation(i, 'offer_price', Number(e.target.value))} className="border-destructive/50" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch checked={v.in_stock} onCheckedChange={(val) => updateVariation(i, 'in_stock', val)} />
                    <Label className="text-xs">Estoque</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={v.is_offer} onCheckedChange={(val) => updateVariation(i, 'is_offer', val)} />
                    <Label className="text-xs">Oferta</Label>
                  </div>
                  {variations.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setVariations((p) => p.filter((_, j) => j !== i))} className="text-destructive h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {/* Wholesale Prices */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Preços no Atacado</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const newWp = [...v.wholesale_prices, { min_quantity: 0, price: 0 }];
                        updateVariation(i, 'wholesale_prices', newWp);
                      }}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Faixa
                    </Button>
                  </div>
                  {v.wholesale_prices.length > 0 && (
                    <div className="space-y-2">
                      {v.wholesale_prices.map((wp, wpIdx) => (
                        <div key={wpIdx} className="flex items-center gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-[10px] text-muted-foreground">A partir de (unid.)</Label>
                            <Input
                              type="number"
                              min={2}
                              value={wp.min_quantity || ''}
                              onChange={(e) => {
                                const newWp = [...v.wholesale_prices];
                                newWp[wpIdx] = { ...newWp[wpIdx], min_quantity: Number(e.target.value) };
                                updateVariation(i, 'wholesale_prices', newWp);
                              }}
                              placeholder="Ex: 10"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Preço unitário (R$)</Label>
                            <Input
                              type="number"
                              value={wp.price || ''}
                              onChange={(e) => {
                                const newWp = [...v.wholesale_prices];
                                newWp[wpIdx] = { ...newWp[wpIdx], price: Number(e.target.value) };
                                updateVariation(i, 'wholesale_prices', newWp);
                              }}
                              placeholder="0.00"
                              className="h-8 text-sm"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive mt-4"
                            onClick={() => {
                              const newWp = v.wholesale_prices.filter((_, j) => j !== wpIdx);
                              updateVariation(i, 'wholesale_prices', newWp);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {v.wholesale_prices.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">Nenhuma faixa de atacado. Clique em "+ Faixa" para adicionar.</p>
                  )}
                </div>

                {/* Variation images */}
                <div className="space-y-2">
                  <Label className="text-xs">Imagens da Variação</Label>
                  <div className="flex flex-wrap gap-2">
                    {v.images.map((img, imgIdx) => (
                      <div key={imgIdx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            const newImages = v.images.filter((_, j) => j !== imgIdx);
                            updateVariation(i, 'images', newImages);
                            if (v.image_url === img) updateVariation(i, 'image_url', newImages[0] || '');
                          }}
                          className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4 text-card" />
                        </button>
                      </div>
                    ))}
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center cursor-pointer transition-colors">
                      <ImagePlus className="w-4 h-4 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = e.target.files;
                          if (!files) return;
                          for (const file of Array.from(files)) {
                            try {
                              const path = `variations/${crypto.randomUUID()}-${file.name}`;
                              const url = await uploadFile('product-images', path, file);
                              setVariations((prev) => prev.map((vr, vi) => {
                                if (vi !== i) return vr;
                                const newImgs = [...vr.images, url];
                                return { ...vr, images: newImgs, image_url: vr.image_url || url };
                              }));
                            } catch (err: any) {
                              toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
                            }
                          }
                        }}
                      />
                    </label>
                  </div>
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
