import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchProduct, createProduct, updateProduct, uploadFile, fetchSetting, fetchProducts, fetchProductUpsells, saveProductUpsells } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Plus, Trash2, ImagePlus, CreditCard, Sparkles, X, PackagePlus, FileUp, FileText, Download, Package, FileDown, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import iconProdutoForm from '@/assets/icon-produto-form-3d.png';
import { Checkbox } from '@/components/ui/checkbox';
import DigitalFilesManager from '@/components/admin/DigitalFilesManager';
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
  is_digital: boolean;
  pending_files?: File[];
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
  is_digital: false,
  pending_files: [],
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
  // Tipo do produto inteiro: físico (com variações/dosagem) ou digital (e-book, curso etc.)
  const [productType, setProductType] = useState<'physical' | 'digital'>('physical');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);
  const [selectedUpsellIds, setSelectedUpsellIds] = useState<string[]>([]);
  const [upsellSearch, setUpsellSearch] = useState('');

  // Progresso de upload de arquivos digitais durante o submit
  type UploadStatus = 'queued' | 'uploading' | 'done' | 'error';
  interface UploadItem {
    key: string;
    name: string;
    size: number;
    status: UploadStatus;
    error?: string;
  }
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [showUploadOverlay, setShowUploadOverlay] = useState(false);

  useEffect(() => {
    fetchProducts().then((data) => {
      setAllProducts((data || []).map((p: any) => ({ id: p.id, name: p.name })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSetting('product_categories').then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setCategoryOptions(parsed);
        } catch {}
      }
    });
  }, []);

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
        setCategory((p as any).category || '');
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
                stock_quantity: Number(v.stock_quantity || 0),
                wholesale_prices: wholesaleMap[v.id] || [],
                is_digital: !!v.is_digital,
                pending_files: [],
              }))
            : [emptyVariation()]
        );
        // Detecta o tipo do produto pela primeira variação
        const anyDigital = (p.product_variations || []).some((v: any) => !!v.is_digital);
        setProductType(anyDigital ? 'digital' : 'physical');
      }).finally(() => setLoadingProduct(false));

      // Load existing upsells
      fetchProductUpsells(id).then(setSelectedUpsellIds).catch(() => {});
    }
  }, [id]);

  const updateVariation = (index: number, field: keyof Variation, value: any) => {
    setVariations((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validação: produto digital novo precisa ter ao menos 1 arquivo pendente.
    // Em edição, arquivos já salvos no banco contam (DigitalFilesManager).
    if (productType === 'digital' && !isEditing) {
      const totalPending = variations.reduce((acc, v) => acc + (v.pending_files?.length || 0), 0);
      if (totalPending === 0) {
        toast({
          title: 'Adicione pelo menos um arquivo',
          description: 'Produtos digitais precisam de ao menos um arquivo para download antes de serem criados.',
          variant: 'destructive',
        });
        return;
      }
    }
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
        category,
        variations: variations
          .filter((v) => v.dosage.trim() !== '' || productType === 'digital' || v.is_digital)
          .map(v => ({
            ...v,
            is_digital: productType === 'digital' ? true : v.is_digital,
            // Variações digitais não exigem dosagem; usamos um rótulo padrão.
            dosage: v.dosage.trim() !== '' ? v.dosage : (productType === 'digital' ? 'Digital' : v.dosage),
            stock_quantity: productType === 'digital' ? 9999 : v.stock_quantity,
            // pending_files não é coluna; remove antes de enviar
            pending_files: undefined,
          })),
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
          .select('id, dosage, created_at')
          .eq('product_id', productId)
          .order('created_at', { ascending: true });
        
        if (savedVars) {
          // ────────────────────────────────────────────────────────────────
          // Pareamento determinístico entre variações do formulário (locais)
          // e variações salvas (savedVars). Estratégia em 2 passos:
          //   1) Variações locais com `id` (edição) → casa por id.
          //   2) Variações locais sem `id` (novas) → casa por ordem de
          //      criação dentro das savedVars que ainda não foram pareadas.
          // Isso evita: (a) colisão quando duas variações têm a mesma
          // dosagem; (b) duplicação de upload quando vários savedVars
          // batem com a mesma matchingVar via `find`; (c) regressão para
          // produtos digitais com múltiplas variações.
          // ────────────────────────────────────────────────────────────────
          const localVars = variations.filter(
            (v) => v.dosage.trim() !== '' || productType === 'digital' || v.is_digital
          );
          const pairing = new Map<string, Variation>(); // savedVar.id -> local Variation
          const usedSavedIds = new Set<string>();
          // Passo 1: pareia por id (edições)
          for (const lv of localVars) {
            if (lv.id) {
              const sv = savedVars.find((s) => s.id === lv.id);
              if (sv) {
                pairing.set(sv.id, lv);
                usedSavedIds.add(sv.id);
              }
            }
          }
          // Passo 2: pareia novas pela ordem dentro das savedVars restantes
          const remainingSaved = savedVars.filter((s) => !usedSavedIds.has(s.id));
          const newLocals = localVars.filter((lv) => !lv.id);
          newLocals.forEach((lv, idx) => {
            const sv = remainingSaved[idx];
            if (sv) pairing.set(sv.id, lv);
          });

          for (const sv of savedVars) {
            const matchingVar = pairing.get(sv.id);
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

          // Upload de arquivos digitais pendentes (capturados no formulário antes de salvar)
          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id;

          // Monta a fila completa para feedback visual
          type Job = { sv: any; file: File; key: string };
          const jobs: Job[] = [];
          for (const sv of savedVars) {
            const matchingVar = pairing.get(sv.id);
            const pending = matchingVar?.pending_files || [];
            for (const file of pending) {
              jobs.push({ sv, file, key: `${sv.id}-${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}` });
            }
          }

          if (jobs.length && userId) {
            setUploadQueue(jobs.map(j => ({
              key: j.key,
              name: j.file.name,
              size: j.file.size,
              status: 'queued',
            })));
            setShowUploadOverlay(true);

            for (const job of jobs) {
              setUploadQueue(prev => prev.map(it => it.key === job.key ? { ...it, status: 'uploading' } : it));
              try {
                const path = `${userId}/${job.sv.id}/${crypto.randomUUID()}-${job.file.name}`;
                const { error: upErr } = await supabase.storage
                  .from('digital-files')
                  .upload(path, job.file, { contentType: job.file.type || 'application/octet-stream' });
                if (upErr) throw upErr;
                await supabase.from('product_variation_files' as any).insert({
                  variation_id: job.sv.id,
                  file_path: path,
                  file_name: job.file.name,
                  file_size: job.file.size,
                  mime_type: job.file.type || 'application/octet-stream',
                  sort_order: 0,
                } as any);
                setUploadQueue(prev => prev.map(it => it.key === job.key ? { ...it, status: 'done' } : it));
              } catch (e: any) {
                setUploadQueue(prev => prev.map(it => it.key === job.key ? { ...it, status: 'error', error: e.message } : it));
                toast({ title: `Falha ao subir ${job.file.name}`, description: e.message, variant: 'destructive' });
              }
            }
          }
        }

        // Save upsell associations
        try {
          await saveProductUpsells(productId, selectedUpsellIds);
        } catch (upsellErr: any) {
          console.error('Save upsells error:', upsellErr);
          toast({ title: 'Aviso', description: 'Produto salvo, mas houve erro ao salvar upsells: ' + upsellErr.message, variant: 'destructive' });
        }
      }

      const hasDigital = variations.some((v) => v.is_digital);
      if (!isEditing && hasDigital && savedProduct?.id) {
        // Redireciona para edição para que o admin possa anexar os arquivos digitais
        toast({ title: 'Produto criado! Agora envie os arquivos digitais.' });
        navigate(`/admin/produtos/${savedProduct.id}`);
      } else {
        navigate('/admin/produtos');
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingProduct) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <AdminPageHeader
        title={
          isEditing
            ? ((name || '').trim() ? `Editar: ${name.trim()}` : 'Editar Produto')
            : 'Novo Produto'
        }
        description={
          isEditing
            ? 'Atualize informações, variações, mídias e regras de venda.'
            : 'Cadastre um novo produto com variações, preços e estoque.'
        }
        iconImage={iconProdutoForm}
        breadcrumbs={[
          { label: 'Produtos', to: '/admin/produtos' },
          { label: isEditing ? ((name || '').trim() || 'Editar') : 'Novo Produto' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/produtos')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar para Produtos
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Informações Básicas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Tipo de produto: físico ou digital */}
            <div className="space-y-2">
              <Label>Tipo de Produto</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProductType('physical')}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                    productType === 'physical'
                      ? 'border-primary bg-primary/5'
                      : 'border-border/40 hover:border-border'
                  }`}
                >
                  <Package className={`w-5 h-5 ${productType === 'physical' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">Produto Físico</p>
                    <p className="text-[11px] text-muted-foreground">Com estoque, frete e dosagens.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setProductType('digital')}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                    productType === 'digital'
                      ? 'border-primary bg-primary/5'
                      : 'border-border/40 hover:border-border'
                  }`}
                >
                  <FileDown className={`w-5 h-5 ${productType === 'digital' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">Produto Digital</p>
                    <p className="text-[11px] text-muted-foreground">E-book, curso, arquivo para download.</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Nome do Produto</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Liberty Pharma 5mg" required />
              </div>
              <div className="space-y-2">
                <Label>Princípio Ativo</Label>
                <Input value={activeIngredient} onChange={(e) => setActiveIngredient(e.target.value)} placeholder="Ex: Tirzepatide" />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                {categoryOptions.length > 0 ? (
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Emagrecimento, Saúde" />
                )}
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

        {productType === 'physical' && (
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
        )}

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
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> Produtos Sugeridos no Checkout (Upsell)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Estes produtos serão exibidos como sugestões "Leve também" no checkout, quando este produto estiver no carrinho. Cliente adiciona com 1 clique.
            </p>

            {/* Selected upsells */}
            {selectedUpsellIds.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-muted/50 border border-border/30 rounded-lg">
                {selectedUpsellIds.map(uid => {
                  const prod = allProducts.find(p => p.id === uid);
                  if (!prod) return null;
                  return (
                    <div
                      key={uid}
                      className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full pl-3 pr-1 py-1 text-xs"
                    >
                      <span className="font-medium">{prod.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedUpsellIds(prev => prev.filter(x => x !== uid))}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search and select */}
            <div className="space-y-2">
              <Label className="text-xs">Adicionar produtos sugeridos</Label>
              <Input
                placeholder="Buscar produtos..."
                value={upsellSearch}
                onChange={(e) => setUpsellSearch(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto border border-border/30 rounded-lg divide-y divide-border/30">
                {allProducts
                  .filter(p => p.id !== id) // exclude self
                  .filter(p => !upsellSearch || p.name.toLowerCase().includes(upsellSearch.toLowerCase()))
                  .slice(0, 50)
                  .map(p => {
                    const checked = selectedUpsellIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 p-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            if (v) {
                              setSelectedUpsellIds(prev => [...prev, p.id]);
                            } else {
                              setSelectedUpsellIds(prev => prev.filter(x => x !== p.id));
                            }
                          }}
                        />
                        <span className="text-sm flex-1">{p.name}</span>
                      </label>
                    );
                  })}
                {allProducts.filter(p => p.id !== id).length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground text-center">Nenhum outro produto disponível.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              {productType === 'digital' ? 'Arquivos & Preço' : 'Variações / Dosagens'}
            </CardTitle>
            {productType === 'physical' && (
              <Button type="button" variant="outline" size="sm" onClick={() => setVariations((p) => [...p, emptyVariation()])}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {(productType === 'digital' ? variations.slice(0, 1) : variations).map((v, i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/50 border border-border/30 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {productType === 'physical' && (
                  <div className="space-y-2">
                    <Label>Dosagem</Label>
                    <Input value={v.dosage} onChange={(e) => updateVariation(i, 'dosage', e.target.value)} placeholder="5mg" />
                  </div>
                  )}
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{productType === 'digital' ? 'Subtítulo' : 'Subtítulo da Variação'}</Label>
                    <Input value={v.subtitle} onChange={(e) => updateVariation(i, 'subtitle', e.target.value)} placeholder={productType === 'digital' ? 'Ex: PDF com 80 páginas + bônus' : 'Ex: contém um total de 20mg, dividida em 4 doses de 15mg.'} />
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
                {productType === 'physical' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Qtd. em Estoque</Label>
                    <Input type="number" min={0} value={v.stock_quantity || ''} onChange={(e) => updateVariation(i, 'stock_quantity', Number(e.target.value))} placeholder="0" />
                  </div>
                </div>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  {productType === 'physical' && (
                  <div className="flex items-center gap-2">
                    <Switch checked={v.in_stock} onCheckedChange={(val) => updateVariation(i, 'in_stock', val)} />
                    <Label className="text-xs">Estoque</Label>
                  </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Switch checked={v.is_offer} onCheckedChange={(val) => updateVariation(i, 'is_offer', val)} />
                    <Label className="text-xs">Oferta</Label>
                  </div>
                  {productType === 'physical' && variations.length > 1 && (
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
                  <Label className="text-xs">{productType === 'digital' ? 'Imagem de Capa' : 'Imagens da Variação'}</Label>
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

                {(productType === 'digital' || v.is_digital) && (
                  v.id ? (
                    <DigitalFilesManager variationId={v.id} />
                  ) : (
                    <div className="space-y-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-primary" />
                        <Label className="text-sm font-semibold leading-none">Arquivos para Download</Label>
                      </div>

                      <label
                        htmlFor={`digital-upload-${i}`}
                        className="flex flex-col items-center justify-center gap-2 p-5 rounded-lg border-2 border-dashed border-primary/40 bg-background/60 hover:bg-primary/5 hover:border-primary/60 transition-colors cursor-pointer text-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <FileUp className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Clique para selecionar arquivos</p>
                        <p className="text-[11px] text-muted-foreground max-w-xs">
                          PDF, DOC, XLS, PPT, TXT, ZIP, JPG, PNG, WEBP &middot; até 50MB cada.
                          Os arquivos serão enviados ao salvar o produto.
                        </p>
                        <input
                          id={`digital-upload-${i}`}
                          type="file"
                          multiple
                          className="hidden"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (!files) return;
                            const arr = Array.from(files).filter(f => {
                              if (f.size > 50 * 1024 * 1024) {
                                toast({ title: `${f.name} excede 50MB`, variant: 'destructive' });
                                return false;
                              }
                              return true;
                            });
                            const current = v.pending_files || [];
                            updateVariation(i, 'pending_files', [...current, ...arr]);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      {(v.pending_files?.length || 0) === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center">Nenhum arquivo selecionado.</p>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between px-1">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {v.pending_files!.length} arquivo{v.pending_files!.length > 1 ? 's' : ''} ·{' '}
                              {(() => {
                                const total = (v.pending_files || []).reduce((acc, f) => acc + f.size, 0);
                                return total < 1024 * 1024
                                  ? `${(total / 1024).toFixed(1)} KB`
                                  : `${(total / (1024 * 1024)).toFixed(1)} MB`;
                              })()}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => updateVariation(i, 'pending_files', [])}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Limpar todos
                            </Button>
                          </div>
                          {(v.pending_files || []).map((f, fi) => (
                            <div key={fi} className="flex items-center gap-2 bg-background/80 rounded px-2 py-1.5 border border-border/40">
                              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive shrink-0"
                                onClick={() => {
                                  const next = (v.pending_files || []).filter((_, j) => j !== fi);
                                  updateVariation(i, 'pending_files', next);
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
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

      {showUploadOverlay && uploadQueue.length > 0 && (() => {
        const total = uploadQueue.length;
        const done = uploadQueue.filter(u => u.status === 'done').length;
        const errors = uploadQueue.filter(u => u.status === 'error').length;
        const finished = done + errors;
        const percent = total === 0 ? 0 : Math.round((finished / total) * 100);
        const allFinished = finished === total;
        return (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-xl overflow-hidden">
              <div className="p-5 border-b border-border">
                <div className="flex items-center gap-2 mb-1">
                  {allFinished ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  )}
                  <h3 className="text-base font-semibold text-foreground">
                    {allFinished ? 'Envio concluído' : 'Enviando arquivos digitais'}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {finished} de {total} concluído{finished !== 1 ? 's' : ''}
                  {errors > 0 ? ` · ${errors} com erro` : ''}
                </p>
                <div className="mt-3">
                  <Progress value={percent} className="h-2" />
                  <p className="text-[11px] text-muted-foreground text-right mt-1">{percent}%</p>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto p-3 space-y-2">
                {uploadQueue.map(item => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/60 border border-border/50"
                  >
                    <div className="shrink-0">
                      {item.status === 'queued' && <Clock className="w-4 h-4 text-muted-foreground" />}
                      {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                      {item.status === 'done' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                      {item.status === 'error' && <AlertCircle className="w-4 h-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.size < 1024 * 1024
                          ? `${(item.size / 1024).toFixed(1)} KB`
                          : `${(item.size / (1024 * 1024)).toFixed(1)} MB`}
                        {' · '}
                        {item.status === 'queued' && 'Enfileirado'}
                        {item.status === 'uploading' && 'Enviando...'}
                        {item.status === 'done' && 'Concluído'}
                        {item.status === 'error' && (item.error || 'Erro')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {allFinished && (
                <div className="p-4 border-t border-border flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setShowUploadOverlay(false);
                      setUploadQueue([]);
                    }}
                  >
                    Fechar
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ProductForm;
